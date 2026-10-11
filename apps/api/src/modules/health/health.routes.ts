import { Router } from 'express';
import type { ReadinessReport } from '@genpath/shared';
import type { AppContext } from '../../context';
import { pingMongo } from '../../db/connection';
import { pingRedis } from '../../lib/redis';

export function healthRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  router.get('/ready', async (_req, res) => {
    const [mongoLatency, redisLatency] = await Promise.all([pingMongo(), pingRedis(ctx.redis)]);
    const redisConfigured = Boolean(ctx.config.redisUrl);
    const { provider } = ctx.config.ai;

    const mongoUp = mongoLatency !== null;
    const redisUp = !redisConfigured || redisLatency !== null;

    const report: ReadinessReport = {
      status: mongoUp && redisUp ? 'ready' : 'not_ready',
      version: ctx.version,
      uptimeSec: Math.round((Date.now() - ctx.startedAt) / 1000),
      checks: {
        mongodb: mongoUp ? { state: 'up', latencyMs: mongoLatency } : { state: 'down' },
        redis: !redisConfigured
          ? { state: 'not_configured' }
          : redisLatency !== null
            ? { state: 'up', latencyMs: redisLatency }
            : { state: 'down' },
        queue: { mode: redisConfigured ? 'bullmq' : 'inline' },
        ai: {
          state:
            provider === 'none' ? 'not_configured' : provider === 'mock' ? 'mock' : 'configured',
          provider,
        },
        embeddings: { provider: ctx.embeddings.id, semantic: ctx.embeddings.semantic },
      },
    };

    res.status(report.status === 'not_ready' ? 503 : 200).json({ data: report });
  });

  return router;
}
