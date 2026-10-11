export type Vector = number[];

export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length)
    throw new RangeError(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
  return sum;
}

export function norm(a: Vector): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1, 1]; 0 when either vector has zero length. */
export function cosine(a: Vector, b: Vector): number {
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

export function normalize(a: Vector): Vector {
  const n = norm(a);
  return n === 0 ? a.map(() => 0) : a.map((x) => x / n);
}

/** Pairwise cosine similarity matrix. */
export function similarityMatrix(vectors: Vector[]): number[][] {
  return vectors.map((a) => vectors.map((b) => cosine(a, b)));
}

/** Deterministic PRNG (mulberry32) so simulations are reproducible. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Top eigenvectors of a symmetric matrix by power iteration with deflation.
 * Deterministic start vector; fine for the small matrices used in labs.
 */
function topEigen(
  matrix: number[][],
  k: number,
  iterations = 200,
): { values: number[]; vectors: Vector[] } {
  const n = matrix.length;
  const work = matrix.map((row) => [...row]);
  const values: number[] = [];
  const vectors: Vector[] = [];
  for (let c = 0; c < k; c += 1) {
    // Seeded random start: a uniform vector would lie in the null space of a centred Gram matrix.
    const rand = seededRandom(1234 + c);
    let v: Vector = normalize(Array.from({ length: n }, () => rand() - 0.5));
    let lambda = 0;
    for (let it = 0; it < iterations; it += 1) {
      const w = work.map((row) => dot(row, v));
      const len = norm(w);
      if (len === 0) break;
      v = w.map((x) => x / len);
      lambda = dot(
        v,
        work.map((row) => dot(row, v)),
      );
    }
    values.push(Math.max(0, lambda));
    vectors.push(v);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) work[i]![j]! -= lambda * v[i]! * v[j]!;
    }
  }
  return { values, vectors };
}

/**
 * Projects vectors to 2D with PCA (via the Gram matrix of centred data, which is cheap when there
 * are few points). Also returns the share of variance the two axes explain — usually far from 100%
 * for high-dimensional data, which is why 2D plots of embeddings are only illustrative.
 */
export function pca2d(vectors: Vector[]): {
  points: [number, number][];
  explainedVariance: number;
} {
  const n = vectors.length;
  if (n === 0) return { points: [], explainedVariance: 0 };
  const dim = vectors[0]!.length;
  const mean = Array.from({ length: dim }, (_, d) => vectors.reduce((s, v) => s + v[d]!, 0) / n);
  const centred = vectors.map((v) => v.map((x, d) => x - mean[d]!));
  const gram = centred.map((a) => centred.map((b) => dot(a, b)));
  const totalVariance = gram.reduce((s, row, i) => s + row[i]!, 0);
  if (n === 1 || totalVariance === 0)
    return { points: vectors.map(() => [0, 0]), explainedVariance: 1 };

  const { values, vectors: eig } = topEigen(gram, Math.min(2, n));
  const points = centred.map((_, i) => {
    const x = (eig[0]?.[i] ?? 0) * Math.sqrt(values[0] ?? 0);
    const y = (eig[1]?.[i] ?? 0) * Math.sqrt(values[1] ?? 0);
    return [x, y] as [number, number];
  });
  const explained = ((values[0] ?? 0) + (values[1] ?? 0)) / totalVariance;
  return { points, explainedVariance: Math.min(1, explained) };
}

export function softmax(values: number[]): number[] {
  const max = Math.max(...values.filter((v) => Number.isFinite(v)));
  const exps = values.map((v) => (Number.isFinite(v) ? Math.exp(v - max) : 0));
  const sum = exps.reduce((s, x) => s + x, 0);
  return exps.map((x) => (sum === 0 ? 0 : x / sum));
}

export function matmul(a: number[][], b: number[][]): number[][] {
  const cols = b[0]?.length ?? 0;
  return a.map((row) =>
    Array.from({ length: cols }, (_, j) => row.reduce((s, x, k) => s + x * (b[k]?.[j] ?? 0), 0)),
  );
}

export function transpose(m: number[][]): number[][] {
  return (m[0] ?? []).map((_, j) => m.map((row) => row[j]!));
}
