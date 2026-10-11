import { normalize, type Vector } from '../math/vector';

/**
 * "local-hash" embeddings: deterministic feature hashing of words and character trigrams.
 *
 * IMPORTANT — this is LEXICAL, not semantic. Two texts score as similar when they share words or
 * word pieces ("embedding" ≈ "embeddings"); synonyms with no shared letters ("car" vs
 * "automobile") score near zero. It exists so retrieval and labs work offline without an AI
 * provider, and it is always labelled as such in the UI.
 */

export const LOCAL_HASH_MODEL = 'local-hash-v1';
export const LOCAL_HASH_DIMENSIONS = 256;

const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have i in is it its of on or that the this to was ' +
    'were will with you your we they he she them our not no do does did so if then than there ' +
    'what which who how when why can could should would may might just also into about over ' +
    'hai hain ka ki ke ko se me mein aur ya bhi to na nahi kya ek yeh woh ye wo'
  ).split(' '),
);

/** 32-bit FNV-1a hash. */
export function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Lowercased word tokens (letters and digits in any script), minus very common words. */
export function contentWords(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFKC')
      .match(/[\p{L}\p{M}\p{N}]+/gu) ?? []
  ).filter((w) => !STOPWORDS.has(w));
}

function addFeature(vector: Vector, feature: string, weight: number): void {
  const h = fnv1a(feature);
  const index = h % vector.length;
  // A second hash picks the sign, which keeps collisions from systematically inflating similarity.
  const sign = fnv1a(feature, 0x9747b28c) & 1 ? 1 : -1;
  vector[index]! += sign * weight;
}

export function localHashEmbed(text: string, dimensions = LOCAL_HASH_DIMENSIONS): Vector {
  const vector = new Array<number>(dimensions).fill(0);
  for (const word of contentWords(text)) {
    addFeature(vector, `w:${word}`, 1);
    const padded = `^${word}$`;
    for (let i = 0; i + 3 <= padded.length; i += 1)
      addFeature(vector, `t:${padded.slice(i, i + 3)}`, 0.35);
  }
  return normalize(vector);
}
