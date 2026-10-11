import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

const MAX_DEPTH = 20;

/** Returns the first key that looks like a MongoDB operator or a dotted path, if any. */
export function findOperatorKey(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return '(too deeply nested)';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOperatorKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (
        key.startsWith('$') ||
        key.includes('.') ||
        key === '__proto__' ||
        key === 'constructor'
      ) {
        return key;
      }
      const found = findOperatorKey(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Defense in depth against NoSQL injection: request bodies and query strings may not contain
 * keys that MongoDB would interpret as operators. Zod validation is the primary defense.
 */
export const rejectOperatorKeys: RequestHandler = (req, _res, next) => {
  const key = findOperatorKey(req.body) ?? findOperatorKey(req.query);
  if (key) {
    next(new AppError('BAD_REQUEST', `Disallowed key "${key.slice(0, 40)}" in request`));
    return;
  }
  next();
};
