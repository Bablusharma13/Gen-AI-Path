export const AI_ERROR_CODES = [
  'NOT_CONFIGURED',
  'AUTH',
  'RATE_LIMITED',
  'TIMEOUT',
  'BAD_REQUEST',
  'MODEL_NOT_FOUND',
  'UNAVAILABLE',
  'CONTENT_FILTERED',
  'INVALID_RESPONSE',
  'ABORTED',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

const RETRYABLE: ReadonlySet<AiErrorCode> = new Set(['RATE_LIMITED', 'UNAVAILABLE', 'TIMEOUT']);

/**
 * Provider-neutral error. `message` is safe to log; `detail` may contain a truncated provider
 * response body and is never shown to learners.
 */
export class AiProviderError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly options: { status?: number; detail?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AiProviderError';
    this.retryable = RETRYABLE.has(code);
  }
}

/** Maps an HTTP status from any provider to a normalised error code. */
export function codeFromStatus(status: number): AiErrorCode {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UNAVAILABLE';
  return 'BAD_REQUEST';
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError'))
  );
}

/** Truncates provider error bodies for logs. */
export function truncateDetail(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
