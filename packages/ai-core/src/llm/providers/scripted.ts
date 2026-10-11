import { AiProviderError, type AiErrorCode } from '../errors';
import type { GenerateRequest, LlmProvider, StopReason, StreamEvent } from '../types';

export type ScriptStep =
  | { kind: 'reply'; text: string; stopReason?: StopReason; model?: string; fallbackUsed?: boolean }
  | { kind: 'error'; code: AiErrorCode; afterText?: string }
  | { kind: 'hang' };

/**
 * Deterministic test double. Each call consumes the next scripted step and records the request,
 * so tests can assert on prompts and simulate failures (rate limits, timeouts, refusals).
 */
export class ScriptedProvider implements LlmProvider {
  readonly id = 'scripted' as const;
  readonly isMock = false;
  readonly requests: GenerateRequest[] = [];

  constructor(private readonly steps: ScriptStep[] = []) {}

  push(...steps: ScriptStep[]): void {
    this.steps.push(...steps);
  }

  async *stream(request: GenerateRequest): AsyncGenerator<StreamEvent> {
    this.requests.push(request);
    const step = this.steps.shift() ?? { kind: 'reply', text: 'OK' };
    if (step.kind === 'hang') {
      await new Promise<void>((_, reject) => {
        request.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
      return;
    }
    if (step.kind === 'error') {
      if (step.afterText) yield { type: 'text', text: step.afterText };
      throw new AiProviderError(step.code, `scripted ${step.code}`);
    }
    for (const piece of step.text.match(/\S+\s*/g) ?? [step.text])
      yield { type: 'text', text: piece };
    yield {
      type: 'done',
      usage: { inputTokens: 100, outputTokens: Math.ceil(step.text.length / 4) },
      stopReason: step.stopReason ?? 'end',
      model: step.model ?? request.model,
      fallbackUsed: step.fallbackUsed ?? false,
    };
  }
}
