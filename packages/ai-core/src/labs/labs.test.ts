import { labStepsSchema } from '@genpath/shared';
import { describe, expect, it } from 'vitest';
import { attentionSteps, computeAttention, toyTokens } from './attention';
import { analyseEmbeddings } from './embedding-lab';
import { runGradientDescent } from './gradient-descent';
import { runRagPipeline } from './rag-pipeline';
import { localHashEmbed } from '../embeddings/local-hash';

describe('gradient descent lab', () => {
  it('converges towards the least-squares optimum with a sensible learning rate', () => {
    const r = runGradientDescent({ learningRate: 0.05, steps: 400 });
    const last = r.history.at(-1)!;
    expect(r.diverged).toBe(false);
    expect(last.loss).toBeLessThan(r.history[0]!.loss);
    expect(last.w).toBeCloseTo(r.optimum.w, 2);
    expect(last.b).toBeCloseTo(r.optimum.b, 1);
  });

  it('detects divergence when the learning rate is too large', () => {
    const r = runGradientDescent({ learningRate: 0.5, steps: 200 });
    expect(r.diverged).toBe(true);
  });

  it('is deterministic', () => {
    expect(runGradientDescent({ learningRate: 0.03, steps: 20 })).toEqual(
      runGradientDescent({ learningRate: 0.03, steps: 20 }),
    );
  });

  it('rejects out-of-range configuration', () => {
    expect(() => runGradientDescent({ learningRate: 5 })).toThrow();
  });
});

describe('attention lab', () => {
  it('produces row-stochastic attention weights', () => {
    const r = computeAttention({ sentence: 'The cat sat on the mat' });
    expect(r.tokens).toEqual(['The', 'cat', 'sat', 'on', 'the', 'mat']);
    for (const row of r.weights) expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    expect(r.outputs[0]).toHaveLength(4);
  });

  it('masks future tokens in causal mode', () => {
    const r = computeAttention({ sentence: 'one two three four', causal: true });
    expect(r.weights[0]).toEqual([1, 0, 0, 0]);
    expect(r.weights[1]![2]).toBe(0);
  });

  it('is deterministic and emits schema-valid steps', () => {
    const a = computeAttention({});
    expect(a).toEqual(computeAttention({}));
    const steps = attentionSteps(a, 7);
    expect(labStepsSchema.safeParse(steps).success).toBe(true);
    expect(steps.map((s) => s.id)).toEqual([
      'tokens',
      'qkv',
      'scores',
      'scale',
      'softmax',
      'output',
      'all',
    ]);
  });

  it('caps the number of tokens', () => {
    expect(toyTokens('a b c d e f g h i j k l m')).toHaveLength(10);
  });
});

describe('RAG pipeline lab', () => {
  it('retrieves the refund policy for a refund question and cites it', () => {
    const r = runRagPipeline({ question: 'Can I get a refund after three weeks?' });
    expect(r.retrieved[0]!.chunk.documentId).toBe('refund-policy');
    expect(r.answer.found).toBe(true);
    expect(r.answer.sentences.length).toBeGreaterThan(0);
    for (const s of r.answer.sentences) expect(s.citation).toBeGreaterThanOrEqual(1);
    expect(labStepsSchema.safeParse(r.steps).success).toBe(true);
  });

  it('refuses instead of guessing when nothing relevant is retrieved', () => {
    const r = runRagPipeline({ question: 'What is the capital of Peru?' });
    expect(r.answer.found).toBe(false);
    expect(r.answer.sentences).toEqual([]);
  });

  it('changes chunking with configuration and stays deterministic', () => {
    const small = runRagPipeline({ chunkSize: 15, overlap: 0 });
    const large = runRagPipeline({ chunkSize: 120, overlap: 10 });
    expect(small.chunks.length).toBeGreaterThan(large.chunks.length);
    expect(runRagPipeline({ chunkSize: 15, overlap: 0 })).toEqual(small);
  });

  it('respects the context token budget', () => {
    const r = runRagPipeline({ topK: 8, chunkSize: 120, tokenBudget: 60 });
    expect(r.droppedForBudget).toBeGreaterThan(0);
  });

  it('validates configuration', () => {
    expect(() => runRagPipeline({ chunkSize: 20, overlap: 20 })).toThrow();
  });
});

describe('embedding lab', () => {
  it('ranks pairs and projects to 2D', () => {
    const sentences = ['The cat sat on the mat', 'A cat slept on the mat', 'Pay the invoice today'];
    const r = analyseEmbeddings(sentences.map((s) => localHashEmbed(s)));
    expect(r.pairs[0]).toMatchObject({ a: 0, b: 1 });
    expect(r.points).toHaveLength(3);
    expect(r.explainedVariance).toBeGreaterThan(0);
    expect(r.explainedVariance).toBeLessThanOrEqual(1);
    expect(r.similarity[0]![0]).toBeCloseTo(1, 10);
  });
});
