import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Keyed hash for storing bearer secrets (refresh/reset tokens) — the raw value is never stored. */
export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Pseudonymous IP for audit/session records (not reversible without the secret). */
export function hashIp(secret: string, ip: string | undefined): string | null {
  return ip ? hmacSha256(secret, `ip:${ip}`).slice(0, 32) : null;
}
