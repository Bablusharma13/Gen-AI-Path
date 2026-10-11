import { describe, expect, it } from 'vitest';
import { chunkText, countWords } from './chunking';

const doc = `# Handbook

## Refunds
First sentence about refunds here. Second sentence adds detail about refunds. Third one closes the topic.

## Office hours
Mentors meet on Tuesdays. Sessions are recorded for everyone.`;

describe('chunkText', () => {
  it('never mixes sections and records heading paths', () => {
    const chunks = chunkText(doc, { maxWords: 100, overlapWords: 0 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.headingPath).toEqual(['Handbook', 'Refunds']);
    expect(chunks[1]!.headingPath).toEqual(['Handbook', 'Office hours']);
  });

  it('offsets point at the exact source text', () => {
    for (const chunk of chunkText(doc, { maxWords: 8, overlapWords: 0 })) {
      const slice = doc.slice(chunk.start, chunk.end);
      expect(slice.startsWith(chunk.text.split(' ')[0]!)).toBe(true);
      expect(slice.endsWith(chunk.text.split(' ').at(-1)!)).toBe(true);
    }
  });

  it('respects the word limit and carries overlap', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} has six words.`).join(
      ' ',
    );
    const chunks = chunkText(text, { maxWords: 20, overlapWords: 6 });
    for (const c of chunks) expect(c.wordCount).toBeLessThanOrEqual(20);
    // The last sentence of each chunk starts the next one.
    for (let i = 1; i < chunks.length; i += 1) {
      const lastSentence = chunks[i - 1]!.text.match(/Sentence number \d+ has six words\.$/)![0];
      expect(chunks[i]!.text.startsWith(lastSentence)).toBe(true);
    }
  });

  it('splits sentences longer than the limit', () => {
    const long = `${'word '.repeat(50).trim()}.`;
    const chunks = chunkText(long, { maxWords: 20, overlapWords: 0 });
    expect(chunks.map((c) => c.wordCount)).toEqual([20, 20, 10]);
  });

  it('covers every word of the input when there is no overlap', () => {
    const chunks = chunkText(doc, { maxWords: 7, overlapWords: 0 });
    const body = doc.replace(/^#.*$/gm, '');
    expect(chunks.reduce((s, c) => s + c.wordCount, 0)).toBe(countWords(body));
  });

  it('validates options', () => {
    expect(() => chunkText(doc, { maxWords: 3, overlapWords: 0 })).toThrow(RangeError);
    expect(() => chunkText(doc, { maxWords: 10, overlapWords: 10 })).toThrow(RangeError);
  });

  it('returns nothing for empty text', () => {
    expect(chunkText('   \n\n', { maxWords: 10, overlapWords: 2 })).toEqual([]);
  });
});
