import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Store } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { AppError } from '../lib/errors';

export interface LimiterOptions {
  name: string;
  windowMs: number;
  limit: number;
  message?: string;
  /** Extra key material (e.g. the email being targeted). Combined with the client IP. */
  key?: (req: Request) => string | undefined;
  /** Key by authenticated user instead of IP when signed in. */
  perUser?: boolean;
}

export type LimiterFactory = (options: LimiterOptions) => RequestHandler;

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

/**
 * Builds rate limiters backed by Redis when available (shared across instances) or memory
 * (single instance, development only).
 */
export function createLimiterFactory(redis: Redis | null): LimiterFactory {
  return (options) => {
    const store: Store | undefined = redis
      ? new RedisStore({
          prefix: `rl:${options.name}:`,
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<RedisReply>,
        })
      : undefined;

    return rateLimit({
      windowMs: options.windowMs,
      limit: options.limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...(store ? { store } : {}),
      keyGenerator: (req) => {
        const base = options.perUser && req.auth ? `u:${req.auth.userId}` : `ip:${clientIp(req)}`;
        const extra = options.key?.(req);
        return extra ? `${base}:${extra}` : base;
      },
      handler: (_req, _res, next) => {
        next(
          new AppError(
            'RATE_LIMITED',
            options.message ?? 'Too many requests. Please wait a moment and try again.',
          ),
        );
      },
    });
  };
}

/** Lowercased email from a JSON body, for per-account throttling. */
export function bodyEmail(req: Request): string | undefined {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : undefined;
}
