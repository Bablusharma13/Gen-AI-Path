import type { RequestHandler } from 'express';
import { safeEqual } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { CSRF_COOKIE } from '../modules/auth/cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for state-changing requests:
 *  1. Origin (or Referer) must be an allowed origin when the browser sends one.
 *  2. Double-submit token: X-CSRF-Token header must equal the gp_csrf cookie.
 */
export function csrfProtection(allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
    if (origin && !allowedOrigins.includes(origin)) {
      return next(new AppError('CSRF_FAILED', 'Request origin is not allowed'));
    }

    const cookie: unknown = req.cookies?.[CSRF_COOKIE];
    const header = req.get('x-csrf-token');
    if (
      typeof cookie !== 'string' ||
      cookie.length < 32 ||
      typeof header !== 'string' ||
      !safeEqual(cookie, header)
    ) {
      return next(
        new AppError('CSRF_FAILED', 'Security check failed. Refresh the page and try again.'),
      );
    }
    next();
  };
}
