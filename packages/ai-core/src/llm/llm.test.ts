import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AiProviderError } from './errors';
import { estimateCostUsd } from './models';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { MockProvider } from './providers/mock';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';
import { ScriptedProvider } from './providers/scripted';
import { LlmService, extractJsonObject } from './service';
import { parseSse } from './sse';
import { collect, type GenerateRequest } from './types';

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const request: GenerateRequest = {
  model: 'test-model',
  system: 'You are a tutor.',
  messages: [{ role: 'user', content: 'What is a token?' }],
  maxOutputTokens: 500,
};

describe('parseSse', () => {
  it('handles split chunks, CRLF, multi-line data and comments', async () => {
    const res = sseResponse([
      ': keep-alive\r\n',
      'event: a\r\nda',
      'ta: line1\r\ndata: line2\r\n\r\n',
      'data: x\n\n',
    ]);
    const out = [];
    for await (const m of parseSse(res.body!)) out.push(m);
    expect(out).toEqual([
      { event: 'a', data: 'line1\nline2' },
      { event: null, data: 'x' },
    ]);
  });
});

describe('OpenAiCompatibleProvider', () => {
  it('streams deltas and reports usage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"model":"gpt-x","choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'http://localhost:11434/v1',
        timeoutMs: 5000,
      });
      const result = await collect(provider.stream({ ...request, json: true }));
      expect(result).toMatchObject({
        text: 'Hello',
        stopReason: 'end',
        model: 'gpt-x',
        usage: { inputTokens: 12, outputTokens: 2 },
      });
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      expect(body.max_tokens).toBe(500);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.temperature).toBeUndefined();
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a tutor.' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses max_completion_tokens for OpenAI and estimates usage when none is reported', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"length"}]}\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const provider = new OpenAiCompatibleProvider({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'k',
        timeoutMs: 5000,
      });
      const result = await collect(provider.stream(request));
      expect(result.stopReason).toBe('max_tokens');
      expect(result.usage.estimated).toBe(true);
      const init = fetchMock.mock.calls[0]![1];
      expect(JSON.parse(init.body as string).max_completion_tokens).toBe(500);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('maps HTTP errors to normalised codes without leaking the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":"slow down"}', { status: 429 })),
    );
    try {
      const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x/v1', timeoutMs: 5000 });
      const err = await collect(provider.stream(request)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).code).toBe('RATE_LIMITED');
      expect((err as AiProviderError).message).not.toContain('slow down');
      expect((err as AiProviderError).options.detail).toContain('slow down');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('GeminiProvider', () => {
  it('streams text parts, skips thought parts and maps usage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"plan...","thought":true}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"Tokens are "}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"pieces."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":3,"thoughtsTokenCount":4},"modelVersion":"gemini-x"}\n\n',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const provider = new GeminiProvider({ apiKey: 'g', timeoutMs: 5000 });
      const result = await collect(provider.stream(request));
      expect(result).toMatchObject({
        text: 'Tokens are pieces.',
        stopReason: 'end',
        model: 'gemini-x',
        usage: { inputTokens: 9, outputTokens: 7 },
      });
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/models/test-model:streamGenerateContent?alt=sse');
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g');
      expect(JSON.parse(init.body as string).systemInstruction.parts[0].text).toBe(
        'You are a tutor.',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports safety blocks as content_filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"candidates":[{"finishReason":"SAFETY"}],"usageMetadata":{"promptTokenCount":3}}\n\n',
          ]),
        ),
    );
    try {
      const result = await collect(
        new GeminiProvider({ apiKey: 'g', timeoutMs: 5000 }).stream(request),
      );
      expect(result.stopReason).toBe('content_filter');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('AnthropicProvider (real SDK over recorded SSE)', () => {
  const anthropicStream = (stopReason: string, text: string) =>
    sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":25,"output_tokens":1}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}\n\n`,
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"${stopReason}","stop_sequence":null},"usage":{"output_tokens":12}}\n\n`,
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);

  it('builds a valid request for claude-opus-5-5 and reads usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicStream('end_turn', 'Hello learner'));
    const provider = new AnthropicProvider({
      apiKey: 'test',
      timeoutMs: 5000,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await collect(
      provider.stream({ ...request, model: 'claude-opus-5-5', effort: 'low', temperature: 0.9 }),
    );
    expect(result).toMatchObject({
      text: 'Hello learner',
      stopReason: 'end',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 25, outputTokens: 12 },
      fallbackUsed: false,
    });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(String(url)).toContain('/v1/messages');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.fallbacks).toBe('default');
    expect(body.max_tokens).toBeGreaterThan(500);
    expect(new Headers(init.headers).get('anthropic-beta')).toContain(
      'server-side-fallback-2026-07-01',
    );
  });

  it('omits effort and fallbacks for models that do not support them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicStream('end_turn', 'ok'));
    const provider = new AnthropicProvider({
      apiKey: 'test',
      timeoutMs: 5000,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await collect(provider.stream({ ...request, model: 'claude-haiku-4-5', effort: 'low' }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.output_config).toBeUndefined();
    expect(body.fallbacks).toBeUndefined();
    expect(body.max_tokens).toBe(500);
  });

  it('surfaces refusals as a stop reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(anthropicStream('refusal', 'partial'));
    const provider = new AnthropicProvider({
      apiKey: 'test',
      timeoutMs: 5000,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await collect(provider.stream({ ...request, model: 'claude-opus-5-5' }));
    expect(result.stopReason).toBe('refusal');
  });

  it('maps HTTP 429 and 401 to normalised errors', async () => {
    const make = (status: number) =>
      new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'nope' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    for (const [status, code] of [
      [429, 'RATE_LIMITED'],
      [401, 'AUTH'],
      [404, 'MODEL_NOT_FOUND'],
    ] as const) {
      const provider = new AnthropicProvider({
        apiKey: 'test',
        timeoutMs: 5000,
        fetch: vi.fn().mockResolvedValue(make(status)) as unknown as typeof fetch,
      });
      const err = await collect(provider.stream({ ...request, model: 'claude-opus-5-5' })).catch(
        (e: unknown) => e,
      );
      expect((err as AiProviderError).code).toBe(code);
    }
  });
});

describe('LlmService', () => {
  it('retries a retryable failure before any output, then succeeds', async () => {
    const provider = new ScriptedProvider([
      { kind: 'error', code: 'RATE_LIMITED' },
      { kind: 'reply', text: 'second try' },
    ]);
    const service = new LlmService({ provider, model: 'm', maxOutputTokens: 100, backoffMs: 0 });
    const result = await service.generate({ system: 's', messages: request.messages });
    expect(result.text).toBe('second try');
    expect(provider.requests).toHaveLength(2);
  });

  it('never retries after partial output reached the learner', async () => {
    const provider = new ScriptedProvider([
      { kind: 'error', code: 'UNAVAILABLE', afterText: 'Half an ans' },
      { kind: 'reply', text: 'x' },
    ]);
    const service = new LlmService({ provider, model: 'm', maxOutputTokens: 100, backoffMs: 0 });
    await expect(
      service.generate({ system: 's', messages: request.messages }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(provider.requests).toHaveLength(1);
  });

  it('does not retry non-retryable errors but falls back on a missing model', async () => {
    const auth = new ScriptedProvider([{ kind: 'error', code: 'AUTH' }]);
    await expect(
      new LlmService({ provider: auth, model: 'm', maxOutputTokens: 10, backoffMs: 0 }).generate({
        system: 's',
        messages: request.messages,
      }),
    ).rejects.toMatchObject({ code: 'AUTH' });
    expect(auth.requests).toHaveLength(1);

    const missing = new ScriptedProvider([
      { kind: 'error', code: 'MODEL_NOT_FOUND' },
      { kind: 'reply', text: 'from fallback' },
    ]);
    const service = new LlmService({
      provider: missing,
      model: 'primary',
      fallbackModel: 'backup',
      maxOutputTokens: 10,
      backoffMs: 0,
    });
    const result = await service.generate({ system: 's', messages: request.messages });
    expect(result.text).toBe('from fallback');
    expect(missing.requests.map((r) => r.model)).toEqual(['primary', 'backup']);
  });

  it('validates JSON output and repairs once', async () => {
    const schema = z.object({ hint: z.string().min(3) });
    const provider = new ScriptedProvider([
      { kind: 'reply', text: 'Sure! {"hint": 1}' },
      { kind: 'reply', text: '```json\n{"hint": "check the loop"}\n```' },
    ]);
    const service = new LlmService({ provider, model: 'm', maxOutputTokens: 100, backoffMs: 0 });
    const { data, attempts } = await service.generateJson(
      { system: 's', messages: request.messages },
      schema,
    );
    expect(data).toEqual({ hint: 'check the loop' });
    expect(attempts).toBe(2);
    expect(provider.requests[1]!.messages.at(-1)!.content).toContain('hint');
    expect(provider.requests.every((r) => r.json)).toBe(true);
  });

  it('rejects output that stays invalid', async () => {
    const provider = new ScriptedProvider([
      { kind: 'reply', text: 'no json' },
      { kind: 'reply', text: '{"other": true}' },
    ]);
    const service = new LlmService({ provider, model: 'm', maxOutputTokens: 100, backoffMs: 0 });
    await expect(
      service.generateJson(
        { system: 's', messages: request.messages },
        z.object({ hint: z.string() }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('propagates cancellation without retrying', async () => {
    const provider = new ScriptedProvider([
      { kind: 'hang' },
      { kind: 'reply', text: 'should not run' },
    ]);
    const service = new LlmService({ provider, model: 'm', maxOutputTokens: 100, backoffMs: 0 });
    const controller = new AbortController();
    const pending = service.generate({
      system: 's',
      messages: request.messages,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    expect(provider.requests).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('extracts JSON objects from noisy text', () => {
    expect(extractJsonObject('Here: {"a": 1} done')).toEqual({ a: 1 });
    expect(extractJsonObject('nothing')).toBeNull();
    expect(extractJsonObject('{broken')).toBeNull();
  });

  it('estimates cost only for models with a known price', () => {
    expect(
      estimateCostUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 100_000 }),
    ).toBeCloseTo(6, 6);
    expect(estimateCostUsd('unknown-model', { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(
      estimateCostUsd(
        'my-model',
        { inputTokens: 2_000_000, outputTokens: 0 },
        { 'my-model': { input: 0.5, output: 1 } },
      ),
    ).toBe(1);
  });

  it('mock provider labels its output and never pretends to be a model', async () => {
    const result = await collect(new MockProvider(0).stream(request));
    expect(result.text).toContain('Mock response — no AI model was called');
    expect(result.usage.estimated).toBe(true);
  });
});

describe('idle timeout (streaming providers)', () => {
  /** A fetch stub whose body emits chunks with delays and honours the request's abort signal. */
  function slowFetch(chunks: string[], delayMs: number, stall = false) {
    return vi.fn((_url: string, init: RequestInit) => {
      const encoder = new TextEncoder();
      const signal = init.signal!;
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason));
          for (const chunk of chunks) {
            await new Promise((r) => setTimeout(r, delayMs));
            if (signal.aborted) return;
            controller.enqueue(encoder.encode(chunk));
          }
          if (!stall) controller.close();
        },
      });
      return Promise.resolve(
        new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
      );
    });
  }

  const pieces = ['A', 'B', 'C', 'D', 'E'].map(
    (t) => `data: {"choices":[{"delta":{"content":"${t}"}}]}\n\n`,
  );

  it('lets a slow model keep streaming past the timeout as long as data keeps arriving', async () => {
    // 5 chunks × 40 ms = 200 ms total, but never more than 40 ms of silence (timeout 100 ms).
    vi.stubGlobal('fetch', slowFetch([...pieces, 'data: [DONE]\n\n'], 40));
    try {
      const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x/v1', timeoutMs: 100 });
      const result = await collect(provider.stream(request));
      expect(result.text).toBe('ABCDE');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails with TIMEOUT when the stream goes silent', async () => {
    vi.stubGlobal('fetch', slowFetch(pieces.slice(0, 1), 10, true));
    try {
      const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x/v1', timeoutMs: 100 });
      const err = await collect(provider.stream(request)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).code).toBe('TIMEOUT');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
