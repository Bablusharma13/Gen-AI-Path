import { z } from 'zod';
import { idleTimeout } from '../idle-timeout';
import { AiProviderError, codeFromStatus, isAbortError, truncateDetail } from '../errors';
import { parseSse } from '../sse';
import {
  estimateTokenCount,
  type GenerateRequest,
  type LlmProvider,
  type StopReason,
  type StreamEvent,
} from '../types';

export interface OpenAiCompatibleOptions {
  /** e.g. https://api.openai.com/v1 or http://localhost:11434/v1 (Ollama) */
  baseUrl: string;
  apiKey?: string | undefined;
  timeoutMs: number;
  /**
   * OpenAI's own API expects `max_completion_tokens`; most compatible servers (Ollama, vLLM,
   * LM Studio) expect `max_tokens`.
   */
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens';
}

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** One streamed chunk of a chat completion (only the fields we read). */
const chunkSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).partial().nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .default([]),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).partial().nullish(),
});

export function mapOpenAiFinish(reason: string | null | undefined): StopReason {
  if (reason === 'stop') return 'end';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'content_filter';
  return 'other';
}

/** Chat Completions over SSE, for OpenAI and any server that implements the same API. */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai-compatible' as const;
  readonly isMock = false;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
  }

  async *stream(request: GenerateRequest): AsyncGenerator<StreamEvent> {
    // Idle timeout: a slow model that keeps streaming is never cut off; a stalled one is.
    const timeout = idleTimeout(this.options.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout.signal])
      : timeout.signal;
    const maxParam =
      this.options.maxTokensParam ??
      (this.baseUrl === OPENAI_DEFAULT_BASE_URL ? 'max_completion_tokens' : 'max_tokens');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.model,
          stream: true,
          stream_options: { include_usage: true },
          [maxParam]: request.maxOutputTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: request.system }, ...request.messages],
        }),
        signal,
      });
    } catch (err) {
      if (isAbortError(err) || (err instanceof DOMException && err.name === 'TimeoutError')) {
        throw timeout.fired
          ? new AiProviderError('TIMEOUT', 'AI provider timed out', { cause: err })
          : new AiProviderError('ABORTED', 'Request was cancelled', { cause: err });
      }
      throw new AiProviderError('UNAVAILABLE', 'Could not reach the AI provider', { cause: err });
    }

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      throw new AiProviderError(
        codeFromStatus(response.status),
        `AI provider returned HTTP ${response.status}`,
        {
          status: response.status,
          detail: truncateDetail(body),
        },
      );
    }

    let text = '';
    let finish: string | null | undefined;
    let model = request.model;
    let usage:
      | { prompt_tokens?: number | undefined; completion_tokens?: number | undefined }
      | null
      | undefined;

    try {
      for await (const message of parseSse(response.body)) {
        timeout.touch();
        if (message.data === '[DONE]') break;
        let parsed;
        try {
          parsed = chunkSchema.safeParse(JSON.parse(message.data));
        } catch {
          continue;
        }
        if (!parsed.success) continue;
        const chunk = parsed.data;
        if (chunk.model) model = chunk.model;
        if (chunk.usage) usage = chunk.usage;
        for (const choice of chunk.choices) {
          const delta = choice.delta?.content;
          if (delta) {
            text += delta;
            yield { type: 'text', text: delta };
          }
          if (choice.finish_reason) finish = choice.finish_reason;
        }
      }
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (timeout.fired)
        throw new AiProviderError('TIMEOUT', 'AI provider timed out', { cause: err });
      if (isAbortError(err))
        throw new AiProviderError('ABORTED', 'Request was cancelled', { cause: err });
      throw new AiProviderError('UNAVAILABLE', 'The AI provider stream broke off', { cause: err });
    }

    const reported = usage?.prompt_tokens !== undefined && usage.completion_tokens !== undefined;
    timeout.clear();
    yield {
      type: 'done',
      usage: reported
        ? { inputTokens: usage!.prompt_tokens!, outputTokens: usage!.completion_tokens! }
        : {
            inputTokens: estimateTokenCount(
              request.system + request.messages.map((m) => m.content).join('\n'),
            ),
            outputTokens: estimateTokenCount(text),
            estimated: true,
          },
      stopReason: mapOpenAiFinish(finish),
      model,
      fallbackUsed: false,
    };
  }
}
