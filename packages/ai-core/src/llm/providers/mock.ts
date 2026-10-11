import {
  estimateTokenCount,
  type GenerateRequest,
  type LlmProvider,
  type StreamEvent,
} from '../types';

export const MOCK_MODEL = 'mock-model';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/**
 * Development-only provider that never calls a model. Every answer says so explicitly, and the
 * API marks its messages `isMock` so the UI can badge them. Refused in production by config.
 */
export class MockProvider implements LlmProvider {
  readonly id = 'mock' as const;
  readonly isMock = true;

  constructor(private readonly delayMs = 15) {}

  private respond(request: GenerateRequest): string {
    const last = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (request.json) {
      return JSON.stringify({
        hint: 'Mock hint: re-read the task and check one requirement at a time. (No AI model was called.)',
        nextStep: 'Run the tests and read the first failing message.',
        concept: 'debugging',
      });
    }
    if (/<source id="1"/.test(last)) {
      // Grounded-answer requests: cite the top source so the citation pipeline can be exercised offline.
      return 'Mock answer — no AI model was called. The most relevant passage is source [1]; configure AI_PROVIDER for a real answer.';
    }
    const quoted = last.length > 160 ? `${last.slice(0, 160)}…` : last;
    return [
      '**Mock response — no AI model was called.**',
      '',
      `You asked: “${quoted}”`,
      '',
      'Configure `AI_PROVIDER` (OpenAI-compatible, Anthropic, Gemini or a local Ollama model) to get real answers. This mock exists so the chat interface can be developed and tested offline.',
    ].join('\n');
  }

  async *stream(request: GenerateRequest): AsyncGenerator<StreamEvent> {
    const text = this.respond(request);
    const pieces = text.match(/\S+\s*/g) ?? [text];
    for (const piece of pieces) {
      await sleep(this.delayMs, request.signal);
      yield { type: 'text', text: piece };
    }
    yield {
      type: 'done',
      usage: {
        inputTokens: estimateTokenCount(
          request.system + request.messages.map((m) => m.content).join('\n'),
        ),
        outputTokens: estimateTokenCount(text),
        estimated: true,
      },
      stopReason: 'end',
      model: MOCK_MODEL,
      fallbackUsed: false,
    };
  }
}
