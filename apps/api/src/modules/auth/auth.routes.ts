import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@genpath/shared';
import { Router, type Request } from 'express';
import type { AppContext } from '../../context';
import { authOf, requireAuth } from '../../middleware/auth';
import { bodyEmail, type LimiterFactory } from '../../middleware/rate-limit';
import { randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { parseBody } from '../../lib/validate';
import type { Services } from '../../services';
import {
  clearSessionCookies,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  setCsrfCookie,
  setSessionCookies,
} from './cookies';

const meta = (req: Request) => ({ userAgent: req.get('user-agent'), ip: req.ip });

function refreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : undefined;
}

export function authRouter(ctx: AppContext, services: Services, limiter: LimiterFactory): Router {
  const router = Router();
  const { config } = ctx;
  const m = config.rateLimitMultiplier;
  const { auth, audit } = services;

  const registerLimit = limiter({ name: 'register', windowMs: 3_600_000, limit: 10 * m });
  const loginIpLimit = limiter({ name: 'login-ip', windowMs: 900_000, limit: 50 * m });
  const loginAccountLimit = limiter({
    name: 'login-acct',
    windowMs: 900_000,
    limit: 10 * m,
    key: bodyEmail,
    message: 'Too many sign-in attempts for this account. Try again in 15 minutes.',
  });
  const emailLimit = limiter({ name: 'email', windowMs: 3_600_000, limit: 5 * m, key: bodyEmail });
  const tokenLimit = limiter({ name: 'token', windowMs: 3_600_000, limit: 20 * m });
  const refreshLimit = limiter({ name: 'refresh', windowMs: 900_000, limit: 120 * m });

  /** Issues the double-submit CSRF cookie (idempotent). */
  router.get('/csrf', (req, res) => {
    const existing: unknown = req.cookies?.[CSRF_COOKIE];
    const token =
      typeof existing === 'string' && /^[A-Za-z0-9_-]{32,100}$/.test(existing)
        ? existing
        : randomToken(32);
    setCsrfCookie(res, config, token);
    res.json({ data: { csrfToken: token } });
  });

  router.post('/register', registerLimit, async (req, res) => {
    const input = parseBody(registerSchema, req);
    const { userId, session } = await auth.register(input, meta(req));
    setSessionCookies(res, config, session);
    await audit.record(req, {
      action: 'auth.register',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
    });
    res.status(201).json({ data: await auth.publicUser(userId) });
  });

  router.post('/login', loginIpLimit, loginAccountLimit, async (req, res) => {
    const input = parseBody(loginSchema, req);
    const { userId, session } = await auth.login(input, meta(req));
    setSessionCookies(res, config, session);
    res.json({ data: await auth.publicUser(userId) });
  });

  router.post('/refresh', refreshLimit, async (req, res) => {
    const token = refreshCookie(req);
    if (!token) {
      clearSessionCookies(res, config);
      throw new AppError('SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
    }
    try {
      const result = await auth.refresh(token);
      if (result.status === 'rotated') setSessionCookies(res, config, result.session);
      res.json({ data: { refreshed: true } });
    } catch (err) {
      clearSessionCookies(res, config);
      throw err;
    }
  });

  router.post('/logout', async (req, res) => {
    await auth.logout(refreshCookie(req), req.auth?.sessionId);
    clearSessionCookies(res, config);
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    const { userId } = authOf(req);
    const count = await auth.revokeAllSessions(userId, 'logout_all');
    clearSessionCookies(res, config);
    await audit.record(req, { action: 'auth.logout_all', metadata: { sessions: count } });
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json({ data: await auth.publicUser(authOf(req).userId) });
  });

  router.post('/verify-email', tokenLimit, async (req, res) => {
    const { token } = parseBody(verifyEmailSchema, req);
    await auth.verifyEmail(token);
    res.json({ data: { verified: true } });
  });

  router.post('/resend-verification', requireAuth, emailLimit, async (req, res) => {
    const sent = await auth.resendVerification(authOf(req).userId);
    res.json({ data: { sent } });
  });

  router.post('/forgot-password', emailLimit, async (req, res) => {
    const { email } = parseBody(forgotPasswordSchema, req);
    await auth.forgotPassword(email);
    // Same response whether or not the account exists.
    res.json({
      data: { message: 'If an account exists for that email, a reset link is on its way.' },
    });
  });

  router.post('/reset-password', tokenLimit, async (req, res) => {
    const { token, password } = parseBody(resetPasswordSchema, req);
    const userId = await auth.resetPassword(token, password);
    clearSessionCookies(res, config);
    await audit.record(req, {
      action: 'auth.password_reset',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
    });
    res.json({ data: { reset: true } });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { userId, sessionId } = authOf(req);
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req);
    await auth.changePassword(userId, currentPassword, newPassword, sessionId);
    await audit.record(req, {
      action: 'auth.password_changed',
      targetType: 'user',
      targetId: userId,
    });
    res.json({ data: { changed: true } });
  });

  return router;
}
