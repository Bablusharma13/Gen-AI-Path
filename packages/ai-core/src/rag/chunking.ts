/**
 * Structure-aware chunking: splits on Markdown headings and sentences, packs sentences into
 * chunks of at most `maxWords` words, and repeats up to `overlapWords` words of trailing context
 * at the start of the next chunk. Offsets point into the original text so citations can be
 * highlighted exactly.
 */

export interface ChunkOptions {
  maxWords: number;
  overlapWords: number;
  /** Start a new chunk whenever the heading changes (default true). */
  splitOnHeadings?: boolean;
}

export interface TextChunk {
  index: number;
  text: string;
  start: number;
  end: number;
  wordCount: number;
  headingPath: string[];
}

interface Unit {
  text: string;
  start: number;
  end: number;
  words: number;
  headingPath: string[];
}

const WORD = /\S+/g;
const SENTENCE = /[^.!?।\n]+(?:[.!?।]+["')\]]*|$)/g;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

function splitLongUnit(unit: Unit, maxWords: number): Unit[] {
  const matches = [...unit.text.matchAll(WORD)];
  const pieces: Unit[] = [];
  for (let i = 0; i < matches.length; i += maxWords) {
    const group = matches.slice(i, i + maxWords);
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const start = unit.start + (first.index ?? 0);
    const end = unit.start + (last.index ?? 0) + last[0].length;
    pieces.push({
      text: unit.text.slice(first.index ?? 0, (last.index ?? 0) + last[0].length),
      start,
      end,
      words: group.length,
      headingPath: unit.headingPath,
    });
  }
  return pieces;
}

function toUnits(text: string, maxWords: number): Unit[] {
  const units: Unit[] = [];
  const headings: string[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      headings.length = level - 1;
      headings[level - 1] = heading[2]!.trim();
      continue;
    }
    for (const match of line.matchAll(SENTENCE)) {
      const raw = match[0];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const leading = raw.length - raw.trimStart().length;
      const unit: Unit = {
        text: trimmed,
        start: lineStart + (match.index ?? 0) + leading,
        end: lineStart + (match.index ?? 0) + leading + trimmed.length,
        words: countWords(trimmed),
        headingPath: headings.filter(Boolean),
      };
      if (unit.words === 0) continue;
      units.push(...(unit.words > maxWords ? splitLongUnit(unit, maxWords) : [unit]));
    }
  }
  return units;
}

export function validateChunkOptions({ maxWords, overlapWords }: ChunkOptions): void {
  if (!Number.isInteger(maxWords) || maxWords < 5)
    throw new RangeError('maxWords must be an integer ≥ 5');
  if (!Number.isInteger(overlapWords) || overlapWords < 0 || overlapWords >= maxWords) {
    throw new RangeError('overlapWords must be an integer ≥ 0 and smaller than maxWords');
  }
}

export function chunkText(text: string, options: ChunkOptions): TextChunk[] {
  validateChunkOptions(options);
  const { maxWords, overlapWords, splitOnHeadings = true } = options;
  const units = toUnits(text.replace(/\r\n?/g, '\n'), maxWords);
  const chunks: TextChunk[] = [];
  let current: Unit[] = [];

  const emit = () => {
    if (current.length === 0) return;
    chunks.push({
      index: chunks.length,
      text: current.map((u) => u.text).join(' '),
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      wordCount: current.reduce((s, u) => s + u.words, 0),
      headingPath: current[current.length - 1]!.headingPath,
    });
  };

  const overlapFrom = (previous: Unit[]): Unit[] => {
    if (overlapWords === 0) return [];
    const carried: Unit[] = [];
    let words = 0;
    for (let i = previous.length - 1; i >= 0; i -= 1) {
      const u = previous[i]!;
      if (words + u.words > overlapWords) break;
      carried.unshift(u);
      words += u.words;
    }
    return carried;
  };

  for (const unit of units) {
    const words = current.reduce((s, u) => s + u.words, 0);
    const headingChanged =
      splitOnHeadings &&
      current.length > 0 &&
      current[current.length - 1]!.headingPath.join('/') !== unit.headingPath.join('/');
    if (headingChanged) {
      emit();
      current = [];
    } else if (current.length > 0 && words + unit.words > maxWords) {
      emit();
      const carried = overlapFrom(current);
      // Never carry so much that the new unit cannot fit.
      current = carried.reduce((s, u) => s + u.words, 0) + unit.words <= maxWords ? carried : [];
    }
    current.push(unit);
  }
  emit();
  return chunks;
}

/** Rough token estimate (≈ 4 characters per token for English). Real tokenizers differ. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
