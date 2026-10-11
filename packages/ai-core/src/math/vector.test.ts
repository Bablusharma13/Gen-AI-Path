import { describe, expect, it } from 'vitest';
import { cosine, dot, matmul, normalize, pca2d, seededRandom, softmax, transpose } from './vector';

describe('vector math', () => {
  it('computes dot products and cosine similarity', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1, 12);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(() => dot([1], [1, 2])).toThrow(RangeError);
  });

  it('normalizes to unit length', () => {
    const v = normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it('softmax is positive, sums to 1 and ignores -Infinity', () => {
    const p = softmax([1, 2, Number.NEGATIVE_INFINITY]);
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(p[2]).toBe(0);
    expect(p[1]!).toBeGreaterThan(p[0]!);
  });

  it('multiplies and transposes matrices', () => {
    expect(matmul([[1, 2]], [[3], [4]])).toEqual([[11]]);
    expect(transpose([[1, 2, 3]])).toEqual([[1], [2], [3]]);
  });

  it('seeded random is deterministic', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('PCA recovers a dominant direction and reports explained variance', () => {
    // Points on a line in 3D: one component explains everything.
    const line = [0, 1, 2, 3, 4].map((t) => [t, 2 * t, -t]);
    const { points, explainedVariance } = pca2d(line);
    expect(explainedVariance).toBeCloseTo(1, 6);
    const xs = points.map((p) => p[0]);
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeCloseTo(4 * Math.sqrt(6), 4);
    for (const [, y] of points) expect(Math.abs(y)).toBeLessThan(1e-6);
  });

  it('PCA preserves pairwise distances when data is already 2D', () => {
    const data = [
      [0, 0, 0],
      [3, 0, 0],
      [0, 4, 0],
    ];
    const { points } = pca2d(data);
    const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(d(points[1]!, points[2]!)).toBeCloseTo(5, 6);
    expect(d(points[0]!, points[1]!)).toBeCloseTo(3, 6);
  });
});
