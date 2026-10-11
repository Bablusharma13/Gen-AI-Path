import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/env';

export const ACCESS_COOKIE = 'gp_at';
export const REFRESH_COOKIE = 'gp_rt';
export const CSRF_COOKIE = 'gp_csrf';
/** Non-sensitive 'probably signed in' hint for the web app's route redirects. Not a credential. */
export const SESSION_HINT_COOKIE = 'gp_s';

/** Refresh cookie is only sent to auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function base(config: AppConfig): CookieOptions {
  return { secure: config.auth.cookieSecure, path: '/' };
}

export function setSessionCookies(
  res: Response,
  config: AppConfig,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(config),
    httpOnly: true,
    sameSite: 'lax',
    maxAge: config.auth.accessTtlSec * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(config),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...base(config),
    httpOnly: true,
    sameSite: 'lax',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response, config: AppConfig): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(config), httpOnly: true, sameSite: 'lax' });
  res.clearCookie(REFRESH_COOKIE, {
    ...base(config),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
  res.clearCookie(SESSION_HINT_COOKIE, { ...base(config), httpOnly: true, sameSite: 'lax' });
}

/** Double-submit CSRF cookie. Readable by the web app's JavaScript by design. */
export function setCsrfCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    ...base(config),
    httpOnly: false,
    sameSite: 'strict',
    maxAge: config.auth.refreshTtlDays * 86_400_000,
  });
}
