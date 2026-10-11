import type { z } from 'zod';
import { AiProviderError, isAbortError } from './errors';
import {
  collect,
  type ChatTurn,
  type GenerateRequest,
  type GenerateResult,
  type LlmProvider,
  type StreamEvent,
  type TokenUsage,
} from './types';

export interface LlmServiceOptions {
  provider: LlmProvider;
  model: string;
  fallbackModel?: string | undefined;
  maxOutputTokens: number;
  /** Retries per model for retryable errors (rate limit, unavailable, timeout). */
  retries?: number;
  /** Base backoff; tests pass 0. */
  backoffMs?: number;
}

export type ServiceRequest = Omit<GenerateRequest, 'model' | 'maxOutputTokens'> & {
  maxOutputTokens?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (isAbortError(err))
    return new AiProviderError('ABORTED', 'Request was cancelled', { cause: err });
  return new AiProviderError('UNAVAILABLE', 'Unexpected AI provider failure', { cause: err });
}

/**
 * Reliability layer over a provider: bounded retries with exponential backoff and jitter, and an
 * optional fallback model. Retries happen only before any text has been streamed — never after
 * partial output reached the learner.
 */
export class LlmService {
  constructor(private readonly options: LlmServiceOptions) {}

  get providerId() {
    return this.options.provider.id;
  }
  get isMock() {
    return this.options.provider.isMock;
  }
  get model() {
    return this.options.model;
  }

  async *stream(request: ServiceRequest): AsyncGenerator<StreamEvent> {
    const models = [
      this.options.model,
      ...(this.options.fallbackModel ? [this.options.fallbackModel] : []),
    ];
    const retries = this.options.retries ?? 1;
    let lastError: AiProviderError | null = null;

    for (const model of models) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        let emitted = false;
        try {
          for await (const event of this.options.provider.stream({
            ...request,
            model,
            maxOutputTokens: request.maxOutputTokens ?? this.options.maxOutputTokens,
          })) {
            if (event.type === 'text') emitted = true;
            yield event;
          }
          return;
        } catch (err) {
          const error = normalize(err);
          if (emitted || error.code === 'ABORTED' || request.signal?.aborted) throw error;
          lastError = error;
          if (!error.retryable) {
            // Not worth retrying this model; a missing model can still fall back.
            if (error.code === 'MODEL_NOT_FOUND') break;
            throw error;
          }
          if (attempt < retries) {
            const base = this.options.backoffMs ?? 500;
            await sleep(base * 2 ** attempt + Math.random() * base);
          }
        }
      }
    }
    throw lastError ?? new AiProviderError('UNAVAILABLE', 'AI provider unavailable');
  }

  generate(request: ServiceRequest): Promise<GenerateResult> {
    return collect(this.stream(request));
  }

  /**
   * Requests JSON and validates it against `schema`. One repair round-trip is attempted with the
   * validation errors; anything still invalid is rejected — partially valid output is never used.
   */
  async generateJson<S extends z.ZodType>(
    request: ServiceRequest,
    schema: S,
  ): Promise<{ data: z.output<S>; result: GenerateResult; attempts: number; usage: TokenUsage }> {
    let messages: ChatTurn[] = request.messages;
    let lastIssues = '';
    // Usage summed over every attempt, so cost tracking includes repairs.
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await this.generate({ ...request, messages, json: true });
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      if (result.usage.estimated) usage.estimated = true;
      const candidate = extractJsonObject(result.text);
      const parsed = candidate === null ? null : schema.safeParse(candidate);
      if (parsed?.success) return { data: parsed.data, result, attempts: attempt, usage };
      lastIssues =
        candidate === null
          ? 'The reply did not contain a JSON object.'
          : (parsed?.error.issues ?? [])
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ');
      messages = [
        ...request.messages,
        { role: 'assistant', content: result.text.slice(0, 4000) },
        {
          role: 'user',
          content: `That reply was not valid: ${lastIssues}. Reply again with only one JSON object that fixes these problems.`,
        },
      ];
    }
    throw new AiProviderError('INVALID_RESPONSE', 'The AI returned output that failed validation', {
      detail: `${lastIssues} (usage: ${usage.inputTokens} in / ${usage.outputTokens} out)`,
    });
  }
}

/** Finds the first {...} JSON object in model output (tolerates prose and Markdown fences). */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
