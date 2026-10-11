import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError, isAbortError, truncateDetail } from '../errors';
import { anthropicModelInfo } from '../models';
import type { GenerateRequest, LlmProvider, StopReason, StreamEvent, TokenUsage } from '../types';

/** Extra output budget for models that think before answering (thinking counts toward max_tokens). */
const THINKING_HEADROOM_TOKENS = 8_000;

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  timeoutMs: number;
  /** Server-side refusal fallback on models that support it (default on). */
  serverFallback?: boolean;
  /** Injected fetch (tests replay recorded SSE through the real SDK). */
  fetch?: typeof fetch;
}

function mapStop(reason: string | null | undefined): StopReason {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end';
  if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'max_tokens';
  if (reason === 'refusal') return 'refusal';
  return 'other';
}

/** Maps SDK errors to provider-neutral ones, most specific class first. */
function normalizeError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (isAbortError(err))
    return new AiProviderError('ABORTED', 'Request was cancelled', { cause: err });
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('TIMEOUT', 'Anthropic request timed out', { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiProviderError('UNAVAILABLE', 'Could not reach Anthropic', { cause: err });
  }
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiProviderError('AUTH', 'Anthropic rejected the API key or permissions', {
      status: err.status,
      cause: err,
    });
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiProviderError('MODEL_NOT_FOUND', 'Anthropic model not found or not available', {
      status: 404,
      cause: err,
    });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiProviderError('RATE_LIMITED', 'Anthropic rate limit reached', {
      status: 429,
      cause: err,
    });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new AiProviderError('UNAVAILABLE', 'Anthropic is temporarily unavailable', {
      status: err.status,
      cause: err,
    });
  }
  if (
    err instanceof Anthropic.BadRequestError ||
    err instanceof Anthropic.UnprocessableEntityError
  ) {
    return new AiProviderError('BAD_REQUEST', 'Anthropic rejected the request', {
      status: err.status,
      detail: truncateDetail(err.message),
      cause: err,
    });
  }
  if (err instanceof Anthropic.APIError) {
    return new AiProviderError('UNAVAILABLE', `Anthropic API error ${err.status ?? ''}`.trim(), {
      ...(err.status !== undefined ? { status: err.status } : {}),
      cause: err,
    });
  }
  return new AiProviderError('UNAVAILABLE', 'Unexpected Anthropic client error', { cause: err });
}

/**
 * Claude via the official Anthropic SDK (streaming). Notes for current models:
 * - `thinking` is omitted: current models then use adaptive thinking (older ones answer directly).
 * - `temperature` is never sent: current models reject non-default sampling parameters.
 * - `output_config.effort` is sent only to models documented to accept it.
 * - Refusals are surfaced as stop reason `refusal`; on supported models the server-side
 *   `fallbacks: "default"` option re-runs a declined request on Anthropic's recommended model.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly isMock = false;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      timeout: options.timeoutMs,
      // Retries are handled once, uniformly, by LlmService.
      maxRetries: 0,
    });
  }

  async *stream(request: GenerateRequest): AsyncGenerator<StreamEvent> {
    const info = anthropicModelInfo(request.model);
    const useFallback = Boolean(info?.serverFallback && this.options.serverFallback !== false);
    const system = request.json
      ? `${request.system}\n\nRespond with a single JSON object only — no prose, no Markdown fences.`
      : request.system;

    let stream;
    try {
      stream = this.client.beta.messages.stream(
        {
          model: request.model,
          max_tokens: request.maxOutputTokens + (info?.effort ? THINKING_HEADROOM_TOKENS : 0),
          system,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          // Auto-cache the conversation prefix so follow-up turns re-use it.
          cache_control: { type: 'ephemeral' },
          ...(info?.effort && request.effort ? { output_config: { effort: request.effort } } : {}),
          ...(useFallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal: request.signal },
      );
    } catch (err) {
      throw normalizeError(err);
    }

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      const usage: TokenUsage = {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
      };
      const fallbackUsed = (final.usage.iterations ?? []).some(
        (entry) => entry.type === 'fallback_message',
      );
      yield {
        type: 'done',
        usage,
        stopReason: mapStop(final.stop_reason),
        model: final.model,
        fallbackUsed,
      };
    } catch (err) {
      throw normalizeError(err);
    }
  }
}
