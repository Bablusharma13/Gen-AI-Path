import { z } from 'zod';

/** MongoDB ObjectId as a 24-char hex string. */
export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

/** Stable content id, e.g. "llm-tokens-context". */
export const contentIdSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'CSRF_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'PREREQUISITES_NOT_MET',
  'AI_NOT_CONFIGURED',
  'AI_PROVIDER_ERROR',
  'AI_TIMEOUT',
  'AI_INVALID_OUTPUT',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiData<T> {
  data: T;
}

export interface ApiPage<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null };
}

/** Localized text. Hinglish (Roman script) and English required; Hindi optional. */
export const localizedTextSchema = z.object({
  hinglish: z.string().min(1),
  en: z.string().min(1),
  hi: z.string().min(1).optional(),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const localizedListSchema = z.object({
  hinglish: z.array(z.string().min(1)).min(1),
  en: z.array(z.string().min(1)).min(1),
  hi: z.array(z.string().min(1)).min(1).optional(),
});
export type LocalizedList = z.infer<typeof localizedListSchema>;
