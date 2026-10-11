import { z } from 'zod';
import type { TokenUsage } from './types';

/**
 * Known Anthropic models and what the API accepts for them. Sources: Anthropic's published model
 * table and first-party API prices as of 2026-10-06. Unknown models get the most conservative
 * behaviour (no effort parameter, no fallbacks, unknown price).
 */
interface AnthropicModelInfo {
  /** Accepts `output_config.effort`. */
  effort: boolean;
  /** Supports the server-side `fallbacks: "default"` refusal fallback. */
  serverFallback: boolean;
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead?: number;
}

export const ANTHROPIC_MODELS: Record<string, AnthropicModelInfo> = {
  'claude-fable-5-1': {
    effort: true,
    serverFallback: true,
    input: 10,
    output: 50,
    cacheRead: 0.25,
  },
  'claude-fable-5': { effort: true, serverFallback: false, input: 10, output: 50 },
  'claude-opus-5-5': { effort: true, serverFallback: true, input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { effort: true, serverFallback: true, input: 5, output: 25 },
  'claude-opus-4-8': { effort: true, serverFallback: false, input: 5, output: 25 },
  'claude-opus-4-7': { effort: true, serverFallback: false, input: 5, output: 25 },
  'claude-opus-4-6': { effort: true, serverFallback: false, input: 5, output: 25 },
  'claude-sonnet-5-5': { effort: true, serverFallback: true, input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { effort: true, serverFallback: false, input: 2, output: 10 },
  'claude-sonnet-4-6': { effort: true, serverFallback: false, input: 3, output: 15 },
  // Haiku 5.5: prices apply to prompts up to 100K tokens ($0.50 / $2.50 beyond).
  'claude-haiku-5-5': { effort: true, serverFallback: false, input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { effort: false, serverFallback: false, input: 1, output: 5 },
};

export function anthropicModelInfo(model: string): AnthropicModelInfo | undefined {
  return ANTHROPIC_MODELS[model];
}

export const priceTableSchema = z.record(
  z.string().min(1),
  z.object({
    input: z.number().min(0),
    output: z.number().min(0),
    cacheRead: z.number().min(0).optional(),
  }),
);
export type PriceTable = z.infer<typeof priceTableSchema>;

/**
 * Estimated cost in USD, or null when the model's price is unknown. Custom prices (for example
 * from AI_PRICING_JSON) take precedence over the built-in Anthropic table. Never guessed.
 */
export function estimateCostUsd(
  model: string,
  usage: TokenUsage,
  custom: PriceTable = {},
): number | null {
  const price = custom[model] ?? ANTHROPIC_MODELS[model];
  if (!price) return null;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const freshInput = Math.max(0, usage.inputTokens);
  const cost =
    (freshInput * price.input +
      usage.outputTokens * price.output +
      cacheRead * (price.cacheRead ?? price.input)) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
