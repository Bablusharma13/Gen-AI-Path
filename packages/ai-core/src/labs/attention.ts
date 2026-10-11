import type { LabStep } from '@genpath/shared';
import { z } from 'zod';
import { fnv1a } from '../embeddings/local-hash';
import { matmul, normalize, seededRandom, softmax, transpose } from '../math/vector';

/**
 * Educational, single-head scaled dot-product attention on toy vectors.
 * The arithmetic is exactly what transformers do; the numbers are NOT from a real model.
 */

export const attentionConfigSchema = z.object({
  sentence: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default('The cat sat on the mat because it was tired'),
  focus: z.number().int().min(0).default(7),
  causal: z.boolean().default(false),
});
export type AttentionConfig = z.input<typeof attentionConfigSchema>;

export const D_MODEL = 8;
export const D_HEAD = 4;
const MAX_TOKENS = 10;

export interface AttentionResult {
  tokens: string[];
  embeddings: number[][];
  queries: number[][];
  keys: number[][];
  values: number[][];
  scores: number[][];
  scaled: number[][];
  weights: number[][];
  outputs: number[][];
  causal: boolean;
}

/** Word-level tokens for readability (real models use subword tokens). */
export function toyTokens(sentence: string): string[] {
  return (sentence.match(/[\p{L}\p{M}\p{N}']+|[^\s\p{L}\p{M}\p{N}]/gu) ?? []).slice(0, MAX_TOKENS);
}

/** Deterministic toy embedding from hashed character trigrams of the token. */
function toyEmbedding(token: string): number[] {
  const v = new Array<number>(D_MODEL).fill(0);
  const padded = `^${token.toLowerCase()}$`;
  for (let i = 0; i + 3 <= padded.length; i += 1) {
    const h = fnv1a(padded.slice(i, i + 3));
    v[h % D_MODEL]! += h & 1 ? 1 : -1;
  }
  v[fnv1a(token.toLowerCase()) % D_MODEL]! += 1.5;
  return normalize(v);
}

function projection(seed: number): number[][] {
  const rand = seededRandom(seed);
  const scale = 1 / Math.sqrt(D_MODEL);
  return Array.from({ length: D_MODEL }, () =>
    Array.from({ length: D_HEAD }, () => (rand() * 2 - 1) * 2 * scale),
  );
}

const W_Q = projection(11);
const W_K = projection(23);
const W_V = projection(37);

const round = (m: number[][], digits = 3) =>
  m.map((row) => row.map((x) => Number(x.toFixed(digits))));

export function computeAttention(input: AttentionConfig = {}): AttentionResult {
  const config = attentionConfigSchema.parse(input);
  const tokens = toyTokens(config.sentence);
  const embeddings = tokens.map(toyEmbedding);
  const queries = matmul(embeddings, W_Q);
  const keys = matmul(embeddings, W_K);
  const values = matmul(embeddings, W_V);
  const scores = matmul(queries, transpose(keys));
  const scaled = scores.map((row, i) =>
    row.map((s, j) => (config.causal && j > i ? Number.NEGATIVE_INFINITY : s / Math.sqrt(D_HEAD))),
  );
  const weights = scaled.map((row) => softmax(row));
  const outputs = matmul(weights, values);
  return {
    tokens,
    embeddings,
    queries,
    keys,
    values,
    scores,
    scaled,
    weights,
    outputs,
    causal: config.causal,
  };
}

/** Step-by-step walk-through for one focus token. */
export function attentionSteps(result: AttentionResult, focusIndex: number): LabStep[] {
  const focus = Math.min(Math.max(0, focusIndex), result.tokens.length - 1);
  const token = result.tokens[focus] ?? '';
  const weightsRow = result.weights[focus] ?? [];
  const ranked = weightsRow
    .map((w, j) => ({ j, w }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 2)
    .map((x) => `token-${x.j}`);
  const finiteRow = (row: number[] | undefined) =>
    (row ?? []).map((x) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null));

  return [
    {
      id: 'tokens',
      stage: 'embed',
      title: 'Tokens become vectors',
      description: `The sentence is split into ${result.tokens.length} tokens. Each token gets an ${D_MODEL}-dimensional embedding (toy values here).`,
      state: { tokens: result.tokens, embeddings: round(result.embeddings) },
      highlights: [`token-${focus}`],
    },
    {
      id: 'qkv',
      stage: 'project',
      title: 'Queries, keys and values',
      description: `Three learned matrices project every embedding into a query (what am I looking for?), a key (what do I contain?) and a value (what do I pass on?), each ${D_HEAD}-dimensional.`,
      state: {
        queries: round(result.queries),
        keys: round(result.keys),
        values: round(result.values),
      },
      highlights: [`token-${focus}`],
    },
    {
      id: 'scores',
      stage: 'score',
      title: `How well “${token}” matches every token`,
      description: `Dot product of the query for “${token}” with every key. Bigger means a better match.${result.causal ? ' Future tokens are masked out (causal attention).' : ''}`,
      state: { focus, scores: finiteRow(result.scores[focus]) },
      highlights: [`token-${focus}`],
    },
    {
      id: 'scale',
      stage: 'scale',
      title: `Scale by √${D_HEAD}`,
      description:
        'Dividing by the square root of the key size keeps scores in a range where softmax still spreads attention instead of picking one token.',
      state: { focus, scaled: finiteRow(result.scaled[focus]) },
      highlights: [`token-${focus}`],
    },
    {
      id: 'softmax',
      stage: 'softmax',
      title: 'Softmax turns scores into weights',
      description: `The weights for “${token}” are positive and sum to 1. The highlighted tokens get the most attention.`,
      state: {
        focus,
        weights: finiteRow(weightsRow),
        sum: Number(weightsRow.reduce((s, w) => s + w, 0).toFixed(6)),
      },
      highlights: ranked,
    },
    {
      id: 'output',
      stage: 'mix',
      title: 'Mix the values',
      description: `The new representation of “${token}” is the weighted sum of all value vectors — information flows from the tokens it attends to.`,
      state: { focus, output: finiteRow(result.outputs[focus]) },
      highlights: ranked,
    },
    {
      id: 'all',
      stage: 'matrix',
      title: 'Every token at once',
      description:
        'Each row is one token attending to all tokens. These toy weights are random, not trained — in a trained model a pronoun like “it” would attend strongly to the noun it refers to. Real models also run many heads in parallel and stack dozens of layers.',
      state: { weights: result.weights.map((row) => finiteRow(row)) },
      highlights: [],
    },
  ];
}
