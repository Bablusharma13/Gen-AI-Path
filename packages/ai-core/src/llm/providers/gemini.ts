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

export interface GeminiOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  timeoutMs: number;
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** Thinking models count reasoning tokens against maxOutputTokens. */
const THINKING_HEADROOM_TOKENS = 8_000;

const chunkSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .default([]),
          })
          .partial()
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .default([]),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      thoughtsTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
    })
    .optional(),
  modelVersion: z.string().optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export function mapGeminiFinish(reason: string | undefined): StopReason {
  if (reason === 'STOP') return 'end';
  if (reason === 'MAX_TOKENS') return 'max_tokens';
  if (
    reason === 'SAFETY' ||
    reason === 'PROHIBITED_CONTENT' ||
    reason === 'BLOCKLIST' ||
    reason === 'SPII'
  ) {
    return 'content_filter';
  }
  return 'other';
}

/** Google Gemini via the Generative Language REST API (streamGenerateContent over SSE). */
export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const;
  readonly isMock = false;

  constructor(private readonly options: GeminiOptions) {}

  async *stream(request: GenerateRequest): AsyncGenerator<StreamEvent> {
    // Idle timeout: a slow model that keeps streaming is never cut off; a stalled one is.
    const timeout = idleTimeout(this.options.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout.signal])
      : timeout.signal;
    const base = (this.options.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, '');
    const url = `${base}/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens + THINKING_HEADROOM_TOKENS,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(request.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal,
      });
    } catch (err) {
      if (timeout.fired)
        throw new AiProviderError('TIMEOUT', 'Gemini request timed out', { cause: err });
      if (isAbortError(err))
        throw new AiProviderError('ABORTED', 'Request was cancelled', { cause: err });
      throw new AiProviderError('UNAVAILABLE', 'Could not reach Gemini', { cause: err });
    }

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      throw new AiProviderError(
        codeFromStatus(response.status),
        `Gemini returned HTTP ${response.status}`,
        {
          status: response.status,
          detail: truncateDetail(body),
        },
      );
    }

    let text = '';
    let finish: string | undefined;
    let model = request.model;
    let usage: z.infer<typeof chunkSchema>['usageMetadata'];
    let blocked = false;

    try {
      for await (const message of parseSse(response.body)) {
        timeout.touch();
        let parsed;
        try {
          parsed = chunkSchema.safeParse(JSON.parse(message.data));
        } catch {
          continue;
        }
        if (!parsed.success) continue;
        const chunk = parsed.data;
        if (chunk.modelVersion) model = chunk.modelVersion;
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        if (chunk.promptFeedback?.blockReason) blocked = true;
        for (const candidate of chunk.candidates) {
          for (const part of candidate.content?.parts ?? []) {
            // Thought summaries (when enabled) are not part of the answer.
            if (part.text && !part.thought) {
              text += part.text;
              yield { type: 'text', text: part.text };
            }
          }
          if (candidate.finishReason) finish = candidate.finishReason;
        }
      }
    } catch (err) {
      if (timeout.fired)
        throw new AiProviderError('TIMEOUT', 'Gemini request timed out', { cause: err });
      if (isAbortError(err))
        throw new AiProviderError('ABORTED', 'Request was cancelled', { cause: err });
      throw new AiProviderError('UNAVAILABLE', 'The Gemini stream broke off', { cause: err });
    }

    const reported = usage?.promptTokenCount !== undefined;
    timeout.clear();
    yield {
      type: 'done',
      usage: reported
        ? {
            inputTokens: usage!.promptTokenCount!,
            outputTokens: (usage!.candidatesTokenCount ?? 0) + (usage!.thoughtsTokenCount ?? 0),
            cacheReadTokens: usage!.cachedContentTokenCount ?? 0,
          }
        : {
            inputTokens: estimateTokenCount(
              request.system + request.messages.map((m) => m.content).join('\n'),
            ),
            outputTokens: estimateTokenCount(text),
            estimated: true,
          },
      stopReason: blocked ? 'content_filter' : mapGeminiFinish(finish),
      model,
      fallbackUsed: false,
    };
  }
}
