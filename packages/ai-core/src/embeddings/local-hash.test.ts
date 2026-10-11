import { describe, expect, it } from 'vitest';
import { cosine, norm } from '../math/vector';
import { contentWords, LOCAL_HASH_DIMENSIONS, localHashEmbed } from './local-hash';

describe('local-hash embeddings', () => {
  it('is deterministic, normalized and fixed-size', () => {
    const a = localHashEmbed('Embeddings turn text into vectors');
    const b = localHashEmbed('Embeddings turn text into vectors');
    expect(a).toEqual(b);
    expect(a).toHaveLength(LOCAL_HASH_DIMENSIONS);
    expect(norm(a)).toBeCloseTo(1, 10);
  });

  it('scores shared words and word pieces higher than unrelated text', () => {
    const query = localHashEmbed('refund after cancellation');
    const related = localHashEmbed('Refunds are paid after you cancel the batch');
    const unrelated = localHashEmbed('Mentors hold office hours on Tuesday');
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it('is lexical, not semantic: synonyms without shared letters score near zero', () => {
    expect(Math.abs(cosine(localHashEmbed('car'), localHashEmbed('automobile')))).toBeLessThan(0.3);
  });

  it('drops stop words and handles empty input', () => {
    expect(contentWords('The cat is on the mat')).toEqual(['cat', 'mat']);
    expect(norm(localHashEmbed('the of and'))).toBe(0);
  });

  it('keeps Devanagari words intact', () => {
    expect(contentWords('एम्बेडिंग्स टेक्स्ट को बदलते हैं')).toContain('एम्बेडिंग्स');
  });
});
