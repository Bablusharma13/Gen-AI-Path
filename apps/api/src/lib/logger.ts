import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config/env';

export type { Logger };

/** Paths that must never reach log output. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.refreshToken',
  '*.apiKey',
  '*.passwordHash',
];

export function createLogger(config: Pick<AppConfig, 'logLevel' | 'env'>): Logger {
  const pretty = config.env === 'development' && process.stdout.isTTY;
  return pino({
    level: config.env === 'test' ? 'silent' : config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'genpath-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
          },
        }
      : {}),
  });
}
