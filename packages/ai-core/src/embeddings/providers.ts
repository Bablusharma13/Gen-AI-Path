import { z } from 'zod';
import { AiProviderError, codeFromStatus, truncateDetail } from '../llm/errors';
import { LOCAL_HASH_DIMENSIONS, LOCAL_HASH_MODEL, localHashEmbed } from './local-hash';

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  readonly id: 'local-hash' | 'openai-compatible' | 'gemini';
  readonly model: string;
  /** False for lexical embeddings that capture shared words, not meaning. */
  readonly semantic: boolean;
  embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult>;
}

const BATCH_SIZE = 64;

async function batched(
  texts: string[],
  embedBatch: (batch: string[]) => Promise<number[][]>,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE)
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE))));
  return out;
}

function checkDimensions(vectors: number[][], model: string): number {
  const dims = vectors[0]?.length ?? 0;
  if (vectors.some((v) => v.length !== dims || v.some((x) => !Number.isFinite(x)))) {
    throw new AiProviderError(
      'INVALID_RESPONSE',
      `Embedding model ${model} returned inconsistent vectors`,
    );
  }
  return dims;
}

export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local-hash' as const;
  readonly model = LOCAL_HASH_MODEL;
  readonly semantic = false;

  async embed(texts: string[]): Promise<EmbeddingResult> {
    return {
      vectors: texts.map((t) => localHashEmbed(t)),
      model: this.model,
      dimensions: LOCAL_HASH_DIMENSIONS,
    };
  }
}

const openAiResponse = z.object({
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })),
  model: z.string().optional(),
});

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai-compatible' as const;
  readonly semantic = true;

  constructor(
    readonly model: string,
    private readonly options: { baseUrl: string; apiKey?: string | undefined; timeoutMs: number },
  ) {}

  async embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult> {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const vectors = await batched(texts, async (input) => {
      const timeout = AbortSignal.timeout(this.options.timeoutMs);
      const res = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.model, input }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }).catch((err: unknown) => {
        throw new AiProviderError(
          timeout.aborted ? 'TIMEOUT' : 'UNAVAILABLE',
          'Embedding request failed',
          { cause: err },
        );
      });
      if (!res.ok) {
        throw new AiProviderError(
          codeFromStatus(res.status),
          `Embedding provider returned HTTP ${res.status}`,
          {
            status: res.status,
            detail: truncateDetail(await res.text().catch(() => '')),
          },
        );
      }
      const parsed = openAiResponse.safeParse(await res.json());
      if (!parsed.success || parsed.data.data.length !== input.length) {
        throw new AiProviderError('INVALID_RESPONSE', 'Unexpected embedding response shape');
      }
      return [...parsed.data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    });
    return { vectors, model: this.model, dimensions: checkDimensions(vectors, this.model) };
  }
}

const geminiResponse = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) });

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'gemini' as const;
  readonly semantic = true;

  constructor(
    readonly model: string,
    private readonly options: { apiKey: string; baseUrl?: string | undefined; timeoutMs: number },
  ) {}

  async embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult> {
    const base = (
      this.options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');
    const modelPath = this.model.startsWith('models/') ? this.model : `models/${this.model}`;
    const vectors = await batched(texts, async (input) => {
      const timeout = AbortSignal.timeout(this.options.timeoutMs);
      const res = await fetch(`${base}/${modelPath}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify({
          requests: input.map((text) => ({ model: modelPath, content: { parts: [{ text }] } })),
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }).catch((err: unknown) => {
        throw new AiProviderError(
          timeout.aborted ? 'TIMEOUT' : 'UNAVAILABLE',
          'Embedding request failed',
          { cause: err },
        );
      });
      if (!res.ok) {
        throw new AiProviderError(
          codeFromStatus(res.status),
          `Gemini embeddings returned HTTP ${res.status}`,
          {
            status: res.status,
            detail: truncateDetail(await res.text().catch(() => '')),
          },
        );
      }
      const parsed = geminiResponse.safeParse(await res.json());
      if (!parsed.success || parsed.data.embeddings.length !== input.length) {
        throw new AiProviderError('INVALID_RESPONSE', 'Unexpected Gemini embedding response shape');
      }
      return parsed.data.embeddings.map((e) => e.values);
    });
    return { vectors, model: this.model, dimensions: checkDimensions(vectors, this.model) };
  }
}

export interface EmbeddingConfig {
  provider: 'local-hash' | 'openai-compatible' | 'gemini';
  model?: string | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs: number;
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'local-hash':
      return new LocalHashEmbeddingProvider();
    case 'openai-compatible':
      return new OpenAiEmbeddingProvider(config.model ?? '', {
        baseUrl: config.baseUrl ?? 'https://api.openai.com/v1',
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
      });
    case 'gemini':
      return new GeminiEmbeddingProvider(config.model ?? '', {
        apiKey: config.apiKey ?? '',
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
      });
  }
}
