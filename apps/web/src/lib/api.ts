import type { ApiErrorBody, ErrorCode } from '@genpath/shared';

const API_BASE = '/api/v1';
const CSRF_COOKIE = 'gp_csrf';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First validation message for a given field path, if any. */
  fieldError(path: string): string | undefined {
    if (!Array.isArray(this.details)) return undefined;
    const match = (this.details as { path?: string; message?: string }[]).find(
      (d) => d.path === path,
    );
    return match?.message;
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

let csrfPromise: Promise<string> | null = null;

/** Ensures the double-submit CSRF cookie exists and returns its value. */
export async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  csrfPromise ??= fetch(`${API_BASE}/auth/csrf`, { credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok)
        throw new ApiError(res.status, 'CSRF_FAILED', 'Could not start a secure session');
      const body = (await res.json()) as { data: { csrfToken: string } };
      return body.data.csrfToken;
    })
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

let refreshPromise: Promise<boolean> | null = null;

/** Rotates the refresh token once, shared by concurrent callers. Resolves false if signed out. */
export function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const csrf = await ensureCsrfToken();
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Do not try a token refresh on 401 (used by auth endpoints themselves). */
  skipRefresh?: boolean;
  formData?: FormData;
}

async function buildHeaders(method: string, hasJsonBody: boolean): Promise<Headers> {
  const headers = new Headers();
  if (hasJsonBody) headers.set('Content-Type', 'application/json');
  if (UNSAFE_METHODS.has(method)) headers.set('X-CSRF-Token', await ensureCsrfToken());
  return headers;
}

export async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET';
  const hasJsonBody = options.body !== undefined && !options.formData;

  const send = async () =>
    fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: await buildHeaders(method, hasJsonBody),
      body: options.formData ?? (hasJsonBody ? JSON.stringify(options.body) : undefined),
      signal: options.signal ?? null,
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !options.skipRefresh) {
      if (await refreshSession()) res = await send();
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach GenPath servers. Check your connection.');
  }
  return res;
}

export async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(
      res.status,
      body.error.code,
      body.error.message,
      body.error.details,
      body.error.requestId,
    );
  } catch {
    return new ApiError(res.status, 'INTERNAL_ERROR', `Request failed (${res.status})`);
  }
}

/** JSON request returning the `data` field of the response envelope. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, options);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as { data: T };
  return body.data;
}

/** JSON request returning the whole envelope (for paginated lists). */
export async function apiPage<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T[]; page: { limit: number; nextCursor: string | null } }> {
  const res = await rawRequest(path, options);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as { data: T[]; page: { limit: number; nextCursor: string | null } };
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
