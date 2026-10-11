import type { Role } from '@genpath/shared';
import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { SessionModel } from '../db/models/session.model';
import { UserModel } from '../db/models/user.model';
import { AppError, forbidden, unauthenticated } from '../lib/errors';
import { ACCESS_COOKIE } from '../modules/auth/cookies';
import type { AccessTokens } from '../modules/auth/tokens';

/**
 * Resolves the session from the access-token cookie. Never rejects the request by itself:
 * routes opt in with `requireAuth` / `requireRole`. Session and user status are checked on
 * every request, so logout, suspension and role changes take effect immediately.
 */
export function authenticate(tokens: AccessTokens): RequestHandler {
  return async (req, _res, next) => {
    const raw: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return next();

    const claims = await tokens.verify(raw);
    if (!claims || !isValidObjectId(claims.sid) || !isValidObjectId(claims.sub)) return next();

    const [session, user] = await Promise.all([
      SessionModel.findById(claims.sid).select('userId revokedAt expiresAt').lean(),
      UserModel.findById(claims.sub).select('role status email name').lean(),
    ]);
    if (
      !session ||
      !user ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.userId.equals(user._id) ||
      user.status !== 'active'
    ) {
      return next();
    }

    req.auth = {
      userId: user._id.toString(),
      sessionId: session._id.toString(),
      role: user.role as Role,
      email: user.email,
      name: user.name,
    };
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.auth ? undefined : unauthenticated());
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}

/** Narrowing helper for handlers mounted behind requireAuth. */
export function authOf(req: { auth?: Express.Request['auth'] }) {
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue');
  return req.auth;
}
