import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: 'gp_csrf=csrf-123' });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('unwraps the data envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    await expect(api<{ ok: boolean }>('/thing')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/thing');
  });

  it('sends the CSRF header on unsafe methods only', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: null }));
    await api('/thing', { method: 'POST', body: { a: 1 } });
    await api('/thing');
    const postHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    const getHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
    expect(postHeaders.get('X-CSRF-Token')).toBe('csrf-123');
    expect(postHeaders.get('Content-Type')).toBe('application/json');
    expect(getHeaders.get('X-CSRF-Token')).toBeNull();
  });

  it('refreshes once on 401 and retries the original request', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { refreshed: true } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { value: 42 } }));
    await expect(api('/me')).resolves.toEqual({ value: 42 });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/refresh');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws a typed ApiError with field details', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: [{ path: 'email', message: 'Enter a valid email address' }],
          requestId: 'req-1',
        },
      }),
    );
    const err = await api('/auth/register', { method: 'POST', body: {}, skipRefresh: true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_ERROR');
    expect((err as ApiError).fieldError('email')).toBe('Enter a valid email address');
    expect((err as ApiError).requestId).toBe('req-1');
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(api('/x', { skipRefresh: true })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
