import type { ErrorCode } from '@genpath/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  CSRF_FAILED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PREREQUISITES_NOT_MET: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  AI_NOT_CONFIGURED: 503,
  AI_PROVIDER_ERROR: 502,
  AI_TIMEOUT: 504,
  AI_INVALID_OUTPUT: 502,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** An error whose message is safe to show to the client. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError('FORBIDDEN', message);
export const unauthenticated = (message = 'Please sign in to continue') =>
  new AppError('UNAUTHENTICATED', message);
