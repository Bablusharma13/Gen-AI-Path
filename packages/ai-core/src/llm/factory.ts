import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { MockProvider } from './providers/mock';
import { OPENAI_DEFAULT_BASE_URL, OpenAiCompatibleProvider } from './providers/openai-compatible';
import type { LlmProvider } from './types';

export interface ProviderConfig {
  provider: 'none' | 'mock' | 'openai-compatible' | 'anthropic' | 'gemini';
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs: number;
  /** Anthropic server-side refusal fallback (default on for supported models). */
  anthropicServerFallback?: boolean;
}

/** Builds the configured provider, or null when AI is not configured. Config is validated upstream. */
export function createLlmProvider(config: ProviderConfig): LlmProvider | null {
  switch (config.provider) {
    case 'none':
      return null;
    case 'mock':
      return new MockProvider();
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: config.apiKey ?? '',
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        serverFallback: config.anthropicServerFallback ?? true,
      });
    case 'gemini':
      return new GeminiProvider({
        apiKey: config.apiKey ?? '',
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
      });
    case 'openai-compatible':
      return new OpenAiCompatibleProvider({
        baseUrl: config.baseUrl ?? OPENAI_DEFAULT_BASE_URL,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
      });
  }
}
