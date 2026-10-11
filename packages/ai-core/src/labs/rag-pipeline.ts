import type { LabStep } from '@genpath/shared';
import { z } from 'zod';
import { contentWords, LOCAL_HASH_DIMENSIONS, localHashEmbed } from '../embeddings/local-hash';
import { chunkText, estimateTokens, type TextChunk } from '../rag/chunking';
import { assembleContext, keywordOverlap, rankHybrid } from '../rag/retrieval';
import { RAG_LAB_CORPUS } from './rag-corpus';

export const ragLabConfigSchema = z
  .object({
    question: z.string().trim().min(3).max(300).default('Can I get a refund after three weeks?'),
    chunkSize: z.number().int().min(10).max(200).default(40),
    overlap: z.number().int().min(0).max(100).default(8),
    topK: z.number().int().min(1).max(8).default(3),
    keywordWeight: z.number().min(0).max(1).default(0.3),
    tokenBudget: z.number().int().min(50).max(4000).default(400),
    documentIds: z.array(z.string()).optional(),
  })
  .refine((c) => c.overlap < c.chunkSize, {
    path: ['overlap'],
    message: 'overlap must be smaller than chunk size',
  });
export type RagLabConfig = z.input<typeof ragLabConfigSchema>;

export interface LabChunk extends TextChunk {
  id: string;
  documentId: string;
  documentTitle: string;
}

export interface RagLabResult {
  config: z.output<typeof ragLabConfigSchema>;
  chunks: LabChunk[];
  retrieved: { chunk: LabChunk; score: number; vectorScore: number; keywordScore: number }[];
  /** Every chunk ranked by score (retrieved ones first). */
  ranking: { id: string; score: number; retrieved: boolean }[];
  context: string;
  contextTokens: number;
  droppedForBudget: number;
  answer: { found: boolean; sentences: { text: string; citation: number }[] };
  steps: LabStep[];
}

/** Minimum combined score for the extractive answer to claim the documents cover the question. */
const ANSWER_THRESHOLD = 0.15;

function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);
}

/**
 * Runs a complete, deterministic RAG pipeline on the fixed lab corpus. The answer is extractive
 * (it quotes retrieved sentences); no language model is involved.
 */
export function runRagPipeline(input: RagLabConfig = {}): RagLabResult {
  const config = ragLabConfigSchema.parse(input);
  const docs = RAG_LAB_CORPUS.filter(
    (d) => !config.documentIds || config.documentIds.includes(d.id),
  );

  const chunks: LabChunk[] = docs.flatMap((doc) =>
    chunkText(doc.text, { maxWords: config.chunkSize, overlapWords: config.overlap }).map((c) => ({
      ...c,
      id: `${doc.id}#${c.index}`,
      documentId: doc.id,
      documentTitle: doc.title,
    })),
  );
  const embedded = chunks.map((c) => ({ item: c, text: c.text, vector: localHashEmbed(c.text) }));
  const queryVector = localHashEmbed(config.question);
  const allRanked = rankHybrid({ text: config.question, vector: queryVector }, embedded, {
    keywordWeight: config.keywordWeight,
    topK: embedded.length,
  });
  const ranked = allRanked.slice(0, config.topK);
  const retrieved = ranked.map((r) => ({
    chunk: r.item,
    score: r.score,
    vectorScore: r.vectorScore,
    keywordScore: r.keywordScore,
  }));

  const assembled = assembleContext(
    retrieved.map((r) => ({ id: r.chunk.id, title: r.chunk.documentTitle, text: r.chunk.text })),
    config.tokenBudget,
  );

  // Extractive answer: the two sentences from cited sources that share the most question words.
  const best = retrieved[0]?.score ?? 0;
  const candidates = assembled.sources.flatMap((source) =>
    sentencesOf(source.text).map((text) => ({
      text,
      citation: source.n,
      overlap: keywordOverlap(config.question, text),
    })),
  );
  const chosen = candidates
    .filter((c) => c.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.citation - b.citation)
    .slice(0, 2);
  const found = best >= ANSWER_THRESHOLD && chosen.length > 0;

  const round = (x: number) => Number(x.toFixed(3));
  const steps: LabStep[] = [
    {
      id: 'ingest',
      stage: 'ingest',
      title: 'Ingest and extract text',
      description: `${docs.length} documents loaded from the lab's fictional student handbook. In production this step parses PDFs, DOCX and web pages.`,
      state: {
        documents: docs.map((d) => ({
          id: d.id,
          title: d.title,
          words: d.text.split(/\s+/).length,
        })),
      },
      highlights: docs.map((d) => d.id),
    },
    {
      id: 'chunk',
      stage: 'chunk',
      title: 'Split into chunks',
      description: `Chunks of at most ${config.chunkSize} words with ${config.overlap} words of overlap, never crossing a heading. Result: ${chunks.length} chunks.`,
      state: {
        chunkCount: chunks.length,
        chunks: chunks.map((c) => ({
          id: c.id,
          words: c.wordCount,
          heading: c.headingPath.join(' › '),
        })),
      },
      highlights: [],
    },
    {
      id: 'embed',
      stage: 'embed',
      title: 'Embed every chunk',
      description: `Each chunk becomes a ${LOCAL_HASH_DIMENSIONS}-dimensional vector (local hashing embedding — lexical, not semantic).`,
      state: { dimensions: LOCAL_HASH_DIMENSIONS, model: 'local-hash-v1', vectors: chunks.length },
      highlights: [],
    },
    {
      id: 'retrieve',
      stage: 'retrieve',
      title: `Retrieve the top ${config.topK}`,
      description: `The question is embedded the same way and compared with every chunk. Score = ${round(1 - config.keywordWeight)} × cosine + ${round(config.keywordWeight)} × keyword overlap.`,
      state: {
        question: config.question,
        questionTerms: contentWords(config.question),
        results: retrieved.map((r) => ({
          id: r.chunk.id,
          score: round(r.score),
          cosine: round(r.vectorScore),
          keyword: round(r.keywordScore),
        })),
      },
      highlights: retrieved.map((r) => r.chunk.id),
    },
    {
      id: 'context',
      stage: 'context',
      title: 'Assemble the context',
      description: `Retrieved chunks are wrapped as numbered <source> blocks (≈${assembled.tokens} tokens of a ${config.tokenBudget}-token budget${assembled.dropped ? `; ${assembled.dropped} dropped to fit` : ''}). The model is told to treat them as data and cite them.`,
      state: {
        tokens: assembled.tokens,
        budget: config.tokenBudget,
        dropped: assembled.dropped,
        sources: assembled.sources.map((s) => ({ n: s.n, id: s.id })),
      },
      highlights: assembled.sources.map((s) => s.id),
    },
    {
      id: 'answer',
      stage: 'answer',
      title: found ? 'Answer with citations' : 'Refuse when retrieval fails',
      description: found
        ? 'This lab builds an extractive answer from the best-matching sentences and keeps their citation numbers. With an AI provider, an LLM would write the answer from the same context.'
        : `The best score (${round(best)}) is below the ${ANSWER_THRESHOLD} threshold, so the system says it cannot answer instead of guessing.`,
      state: {
        found,
        bestScore: round(best),
        sentences: chosen.map((c) => ({ text: c.text, citation: c.citation })),
      },
      highlights: [],
    },
  ];

  return {
    config,
    chunks,
    retrieved,
    ranking: allRanked.map((r, i) => ({
      id: r.item.id,
      score: r.score,
      retrieved: i < config.topK,
    })),
    context: assembled.context,
    contextTokens: estimateTokens(assembled.context),
    droppedForBudget: assembled.dropped,
    answer: {
      found,
      sentences: found ? chosen.map((c) => ({ text: c.text, citation: c.citation })) : [],
    },
    steps,
  };
}
