export type ProviderId = 'openai-compatible' | 'anthropic' | 'gemini' | 'mock' | 'scripted';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** How much reasoning effort to request, where the model supports it. */
export type Effort = 'low' | 'medium' | 'high';

export interface GenerateRequest {
  model: string;
  /** Trusted operator instructions (never contains learner input). */
  system: string;
  messages: ChatTurn[];
  /** Upper bound for the visible answer. Providers may add headroom for hidden reasoning. */
  maxOutputTokens: number;
  effort?: Effort;
  /** Only sent to providers/models that accept it. */
  temperature?: number;
  /** Ask the provider for a JSON object (best effort; output is always validated). */
  json?: boolean;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** True when the provider did not report usage and the numbers are estimates. */
  estimated?: boolean;
}

/** Normalised reasons a generation ended. */
export type StopReason = 'end' | 'max_tokens' | 'refusal' | 'content_filter' | 'other';

export type StreamEvent =
  | { type: 'text'; text: string }
  | {
      type: 'done';
      usage: TokenUsage;
      stopReason: StopReason;
      /** Model that actually produced the answer (may differ after a server-side fallback). */
      model: string;
      fallbackUsed: boolean;
    };

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
  stopReason: StopReason;
  model: string;
  fallbackUsed: boolean;
}

export interface LlmProvider {
  readonly id: ProviderId;
  /** Mock providers never call a model; their output must be labelled as mock in the UI. */
  readonly isMock: boolean;
  stream(request: GenerateRequest): AsyncIterable<StreamEvent>;
}

/** Collects a stream into a single result. */
export async function collect(stream: AsyncIterable<StreamEvent>): Promise<GenerateResult> {
  let text = '';
  for await (const event of stream) {
    if (event.type === 'text') text += event.text;
    else
      return {
        text,
        usage: event.usage,
        stopReason: event.stopReason,
        model: event.model,
        fallbackUsed: event.fallbackUsed,
      };
  }
  throw new Error('Stream ended without a done event');
}

/** Rough token estimate (≈ 4 characters per token) for providers that report no usage. */
export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
