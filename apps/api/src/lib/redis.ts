import { Redis } from 'ioredis';
import type { Logger } from './logger';

/**
 * Creates a Redis client when REDIS_URL is configured. Returns null otherwise — callers must use
 * their documented in-memory/in-process fallbacks (development only).
 */
export async function createRedis(url: string | undefined, logger: Logger): Promise<Redis | null> {
  if (!url) return null;
  const client = new Redis(url, {
    // Required by BullMQ for blocking connections; harmless for other uses.
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableReadyCheck: true,
  });
  client.on('error', (err) => logger.error({ err: err.message }, 'Redis error'));
  await client.connect();
  logger.info('Redis connected');
  return client;
}

export async function pingRedis(client: Redis | null): Promise<number | null> {
  if (!client) return null;
  const started = performance.now();
  try {
    await client.ping();
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}
