import { pca2d, similarityMatrix, type Vector } from '../math/vector';

export interface EmbeddingLabResult {
  similarity: number[][];
  points: [number, number][];
  /** Share of total variance the 2D projection keeps (illustrative only). */
  explainedVariance: number;
  /** Sentence pairs sorted from most to least similar. */
  pairs: { a: number; b: number; score: number }[];
}

/** Analyses a set of vectors: cosine matrix, ranked pairs and a 2D PCA projection. */
export function analyseEmbeddings(vectors: Vector[]): EmbeddingLabResult {
  const similarity = similarityMatrix(vectors);
  const pairs: EmbeddingLabResult['pairs'] = [];
  for (let a = 0; a < vectors.length; a += 1) {
    for (let b = a + 1; b < vectors.length; b += 1) pairs.push({ a, b, score: similarity[a]![b]! });
  }
  pairs.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
  const { points, explainedVariance } = pca2d(vectors);
  return { similarity, points, explainedVariance, pairs };
}
