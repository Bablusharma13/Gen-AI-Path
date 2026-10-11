import type { LoginInput, PublicUser, RegisterInput, Role } from '@genpath/shared';
import { Types } from 'mongoose';
import type { AppConfig } from '../../config/env';
import { AuthTokenModel, type AuthTokenType } from '../../db/models/auth-token.model';
import { ProfileModel } from '../../db/models/profile.model';
import { SessionModel } from '../../db/models/session.model';
import { UserModel, type User } from '../../db/models/user.model';
import { hashIp, hmacSha256, randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { Mailer } from '../../lib/mailer';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import type { AccessTokens } from './tokens';

/** Concurrent refreshes (e.g. two tabs) within this window are not treated as token theft. */
const ROTATION_GRACE_MS = 30_000;
const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 30 * 60 * 1000;

export interface ClientMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export type RefreshResult =
  | { status: 'rotated'; session: IssuedSession }
  /** A concurrent request already rotated this token; the browser holds the new cookies. */
  | { status: 'already_rotated' };

interface Deps {
  config: AppConfig;
  logger: Logger;
  mailer: Mailer;
  tokens: AccessTokens;
}

export class AuthService {
  constructor(private readonly deps: Deps) {}

  private hashSecret(value: string): string {
    return hmacSha256(this.deps.config.auth.refreshSecret, value);
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.deps.config.auth.refreshTtlDays * 86_400_000);
  }

  async register(
    input: RegisterInput,
    meta: ClientMeta,
  ): Promise<{ userId: string; session: IssuedSession }> {
    const exists = await UserModel.exists({ email: input.email });
    if (exists) {
      throw new AppError('CONFLICT', 'An account with this email already exists. Try signing in.');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await UserModel.create({ email: input.email, name: input.name, passwordHash });
    await ProfileModel.create({ userId: user._id });

    await this.sendVerificationEmail(user).catch((err: unknown) =>
      this.deps.logger.error({ err, userId: user._id }, 'verification email failed'),
    );
    const session = await this.createSession(user._id, meta);
    return { userId: user._id.toString(), session };
  }

  async login(
    input: LoginInput,
    meta: ClientMeta,
  ): Promise<{ userId: string; session: IssuedSession }> {
    const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
    if (!user) {
      await verifyAgainstDummy(input.password);
      throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect');
    if (user.status !== 'active') {
      throw new AppError('FORBIDDEN', 'This account is suspended. Contact support.');
    }
    user.lastLoginAt = new Date();
    await user.save();
    const session = await this.createSession(user._id, meta);
    return { userId: user._id.toString(), session };
  }

  async createSession(userId: Types.ObjectId, meta: ClientMeta): Promise<IssuedSession> {
    const refreshToken = randomToken(32);
    const refreshExpiresAt = this.refreshExpiry();
    const session = await SessionModel.create({
      userId,
      refreshTokenHash: this.hashSecret(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ipHash: hashIp(this.deps.config.auth.refreshSecret, meta.ip),
      lastUsedAt: new Date(),
      expiresAt: refreshExpiresAt,
    });
    const accessToken = await this.deps.tokens.sign({
      sub: userId.toString(),
      sid: session._id.toString(),
    });
    return { sessionId: session._id.toString(), accessToken, refreshToken, refreshExpiresAt };
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated (outside the short
   * grace window) revokes the whole session: someone else may hold a copy.
   */
  async refresh(refreshToken: string): Promise<RefreshResult> {
    const hash = this.hashSecret(refreshToken);
    const now = new Date();
    const newToken = randomToken(32);
    const refreshExpiresAt = this.refreshExpiry();

    // Atomic rotation: only one concurrent request can win.
    const session = await SessionModel.findOneAndUpdate(
      { refreshTokenHash: hash, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: {
          refreshTokenHash: this.hashSecret(newToken),
          previousTokenHash: hash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: refreshExpiresAt,
        },
      },
      { returnDocument: 'after' },
    ).lean();

    if (!session) {
      const reused = await SessionModel.findOne({
        previousTokenHash: hash,
        revokedAt: null,
      }).lean();
      if (reused) {
        const rotatedAt = reused.rotatedAt?.getTime() ?? 0;
        if (Date.now() - rotatedAt <= ROTATION_GRACE_MS) return { status: 'already_rotated' };
        await SessionModel.updateOne(
          { _id: reused._id },
          { $set: { revokedAt: now, revokedReason: 'refresh_token_reuse' } },
        );
        this.deps.logger.warn(
          { sessionId: reused._id },
          'refresh token reuse detected; session revoked',
        );
      }
      throw new AppError('SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
    }

    const user = await UserModel.findById(session.userId).select('status').lean();
    if (!user || user.status !== 'active') {
      await SessionModel.updateOne(
        { _id: session._id },
        { $set: { revokedAt: now, revokedReason: 'user_inactive' } },
      );
      throw new AppError('SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
    }

    const accessToken = await this.deps.tokens.sign({
      sub: session.userId.toString(),
      sid: session._id.toString(),
    });
    return {
      status: 'rotated',
      session: {
        sessionId: session._id.toString(),
        accessToken,
        refreshToken: newToken,
        refreshExpiresAt,
      },
    };
  }

  /** Revokes the session identified by the refresh cookie and/or the access token's session id. */
  async logout(refreshToken: string | undefined, sessionId: string | undefined): Promise<void> {
    const or: Record<string, unknown>[] = [];
    if (refreshToken) or.push({ refreshTokenHash: this.hashSecret(refreshToken) });
    if (sessionId && Types.ObjectId.isValid(sessionId))
      or.push({ _id: new Types.ObjectId(sessionId) });
    if (or.length === 0) return;
    await SessionModel.updateMany(
      { $or: or, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
    );
  }

  async revokeAllSessions(
    userId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId), revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    const result = await SessionModel.updateMany(filter, {
      $set: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.modifiedCount;
  }

  private async issueToken(
    userId: Types.ObjectId,
    type: AuthTokenType,
    ttlMs: number,
  ): Promise<string> {
    // Only the newest token of each type stays valid.
    await AuthTokenModel.deleteMany({ userId, type, usedAt: null });
    const token = randomToken(32);
    await AuthTokenModel.create({
      userId,
      type,
      tokenHash: this.hashSecret(`${type}:${token}`),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  private async consumeToken(type: AuthTokenType, token: string): Promise<Types.ObjectId> {
    const record = await AuthTokenModel.findOneAndUpdate(
      {
        tokenHash: this.hashSecret(`${type}:${token}`),
        type,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
    ).lean();
    if (!record) throw new AppError('BAD_REQUEST', 'This link is invalid or has expired.');
    return record.userId;
  }

  async sendVerificationEmail(
    user: Pick<User, '_id' | 'email' | 'name' | 'emailVerifiedAt'>,
  ): Promise<void> {
    if (user.emailVerifiedAt) return;
    const token = await this.issueToken(user._id, 'verify_email', VERIFY_EMAIL_TTL_MS);
    const link = `${this.deps.config.webUrl}/verify-email?token=${token}`;
    await this.deps.mailer.send({
      to: user.email,
      subject: 'Verify your GenPath AI email',
      text: `Hi ${user.name},\n\nConfirm your email address to secure your account:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
    });
  }

  /** Returns false when the email is already verified (nothing sent). */
  async resendVerification(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId).select('email name emailVerifiedAt').lean();
    if (!user || user.emailVerifiedAt) return false;
    await this.sendVerificationEmail(user);
    return true;
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeToken('verify_email', token);
    await UserModel.updateOne(
      { _id: userId, emailVerifiedAt: null },
      { $set: { emailVerifiedAt: new Date() } },
    );
  }

  /** Always resolves, whether or not the account exists (no enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await UserModel.findOne({ email, status: 'active' }).select('email name').lean();
    if (!user) return;
    const token = await this.issueToken(user._id, 'reset_password', RESET_PASSWORD_TTL_MS);
    const link = `${this.deps.config.webUrl}/reset-password?token=${token}`;
    await this.deps.mailer.send({
      to: user.email,
      subject: 'Reset your GenPath AI password',
      text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your password:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not ask for this, you can ignore this email — your password has not changed.`,
    });
  }

  async resetPassword(token: string, password: string): Promise<string> {
    const userId = await this.consumeToken('reset_password', token);
    const passwordHash = await hashPassword(password);
    await UserModel.updateOne({ _id: userId }, { $set: { passwordHash } });
    // A reset proves control of the email: mark it verified and sign out everywhere.
    await UserModel.updateOne(
      { _id: userId, emailVerifiedAt: null },
      { $set: { emailVerifiedAt: new Date() } },
    );
    await this.revokeAllSessions(userId.toString(), 'password_reset');
    return userId.toString();
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string,
  ): Promise<void> {
    const user = await UserModel.findById(userId).select('+passwordHash');
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    await this.revokeAllSessions(userId, 'password_changed', currentSessionId);
  }

  async publicUser(userId: string): Promise<PublicUser> {
    const [user, profile] = await Promise.all([
      UserModel.findById(userId).lean(),
      ProfileModel.findOne({ userId }).select('onboardingCompletedAt').lean(),
    ]);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue');
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role as Role,
      emailVerified: Boolean(user.emailVerifiedAt),
      onboardingCompleted: Boolean(profile?.onboardingCompletedAt),
      createdAt: user.createdAt.toISOString(),
    };
  }
}
