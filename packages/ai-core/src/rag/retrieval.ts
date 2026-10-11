import { contentWords } from '../embeddings/local-hash';
import { cosine, type Vector } from '../math/vector';
import { estimateTokens } from './chunking';

export interface Scored<T> {
  item: T;
  score: number;
  /** Cosine similarity component. */
  vectorScore: number;
  /** Fraction of query terms found in the text (0–1). */
  keywordScore: number;
}

/** Share of distinct query content words that appear in the text. */
export function keywordOverlap(query: string, text: string): number {
  const q = new Set(contentWords(query));
  if (q.size === 0) return 0;
  const t = new Set(contentWords(text));
  let hits = 0;
  for (const w of q) if (t.has(w)) hits += 1;
  return hits / q.size;
}

/**
 * Hybrid ranking: cosine similarity blended with keyword overlap. `keywordWeight = 0` gives pure
 * vector search. Ties keep input order, so results are deterministic.
 */
export function rankHybrid<T>(
  query: { text: string; vector: Vector },
  items: { item: T; text: string; vector: Vector }[],
  options: { keywordWeight?: number; topK: number; minScore?: number },
): Scored<T>[] {
  const keywordWeight = options.keywordWeight ?? 0;
  return items
    .map((entry, order) => {
      const vectorScore = cosine(query.vector, entry.vector);
      const keywordScore = keywordWeight > 0 ? keywordOverlap(query.text, entry.text) : 0;
      return {
        order,
        scored: {
          item: entry.item,
          vectorScore,
          keywordScore,
          score: (1 - keywordWeight) * vectorScore + keywordWeight * keywordScore,
        },
      };
    })
    .filter(({ scored }) => scored.score >= (options.minScore ?? Number.NEGATIVE_INFINITY))
    .sort((a, b) => b.scored.score - a.scored.score || a.order - b.order)
    .slice(0, options.topK)
    .map(({ scored }) => scored);
}

export interface ContextSource {
  /** Citation number shown to the model and the learner, 1-based. */
  n: number;
  id: string;
  title: string;
  text: string;
}

/**
 * Makes text safe to place inside `<tag>…</tag>`: any closing tag with the same name (any case,
 * optional spaces) is escaped, so untrusted content cannot end its own data block early.
 */
export function neutraliseTag(text: string, tag: string): string {
  return text.replace(new RegExp(`<\\s*/\\s*${tag}\\s*>`, 'gi'), `&lt;/${tag}&gt;`);
}

/**
 * Packs retrieved passages into a context block within a token budget. Each passage is wrapped in
 * a delimited, numbered block so the model can cite it and treat it as data, not instructions.
 */
export function assembleContext(
  passages: { id: string; title: string; text: string }[],
  tokenBudget: number,
): { context: string; sources: ContextSource[]; tokens: number; dropped: number } {
  const sources: ContextSource[] = [];
  const blocks: string[] = [];
  let tokens = 0;
  let dropped = 0;
  for (const p of passages) {
    const n = sources.length + 1;
    const title = p.title.replace(/"/g, "'").replace(/[<>]/g, '');
    const block = `<source id="${n}" title="${title}">\n${neutraliseTag(p.text, 'source')}\n</source>`;
    const cost = estimateTokens(block);
    if (tokens + cost > tokenBudget) {
      dropped += 1;
      continue;
    }
    tokens += cost;
    blocks.push(block);
    sources.push({ n, id: p.id, title: p.title, text: p.text });
  }
  return { context: blocks.join('\n\n'), sources, tokens, dropped };
}

/** Citation markers like [1] or [2, 3] found in an answer. */
export function extractCitations(answer: string): number[] {
  const found = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of match[1]!.split(',')) found.add(Number(n.trim()));
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Removes citations that do not refer to a source actually given to the model.
 * Returns the cleaned answer plus the valid and invalid citation numbers.
 */
export function validateCitations(
  answer: string,
  sourceCount: number,
): { answer: string; valid: number[]; invalid: number[] } {
  const all = extractCitations(answer);
  const valid = all.filter((n) => n >= 1 && n <= sourceCount);
  const invalid = all.filter((n) => !valid.includes(n));
  if (invalid.length === 0) return { answer, valid, invalid };
  const cleaned = answer.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, list: string) => {
    const kept = list
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => valid.includes(n));
    return kept.length ? `[${kept.join(', ')}]` : '';
  });
  return { answer: cleaned, valid, invalid };
}
