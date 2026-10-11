import {
  chatRequestSchema,
  explainRequestSchema,
  feedbackSchema,
  hintRequestSchema,
  labEmbeddingsSchema,
  objectIdSchema,
} from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../middleware/auth';
import type { LimiterFactory } from '../../middleware/rate-limit';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import type { Services } from '../../services';

const idParams = z.object({ id: objectIdSchema });
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const HEARTBEAT_MS = 15_000;

export function aiRouter(services: Services, limiter: LimiterFactory, multiplier: number): Router {
  const router = Router();
  router.use(requireAuth);
  const { mentor } = services;
  // Short-window burst limit on top of the daily quota.
  const burst = limiter({
    name: 'ai-burst',
    windowMs: 60_000,
    limit: 10 * multiplier,
    perUser: true,
    message: 'Too many AI requests in a minute. Take a breath and try again shortly.',
  });

  router.get('/status', async (req, res) => {
    res.json({ data: await mentor.status(authOf(req).userId) });
  });

  router.get('/usage', async (req, res) => {
    res.json({ data: await mentor.usage(authOf(req).userId) });
  });

  /**
   * Streams the mentor's answer as Server-Sent Events (POST + fetch stream on the client).
   * Validation, quota and persistence happen first so those errors are ordinary JSON responses.
   */
  router.post('/chat/stream', burst, async (req, res) => {
    const { userId } = authOf(req);
    const input = parseBody(chatRequestSchema, req);
    const prepared = await services.mentor.prepareChat(userId, input);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // no-transform stops proxies (and compression) from buffering the stream.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    try {
      for await (const event of mentor.runChat(userId, prepared, controller.signal)) {
        if (res.writableEnded || controller.signal.aborted) break;
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (err) {
      req.log.error({ err }, 'chat stream failed');
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Something went wrong.', messageId: prepared.assistantMessageId })}\n\n`,
        );
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  });

  router.get('/sessions', async (req, res) => {
    const { limit } = parseQuery(listQuery, req);
    res.json({ data: await mentor.listSessions(authOf(req).userId, limit) });
  });

  router.get('/sessions/:id', async (req, res) => {
    const { id } = parseParams(idParams, req);
    res.json({ data: await mentor.getSession(authOf(req).userId, id) });
  });

  router.delete('/sessions/:id', async (req, res) => {
    const { id } = parseParams(idParams, req);
    await mentor.deleteSession(authOf(req).userId, id);
    res.status(204).end();
  });

  router.delete('/sessions', async (req, res) => {
    const { userId } = authOf(req);
    const result = await mentor.deleteAllSessions(userId);
    await services.audit.record(req, {
      action: 'ai.history_deleted',
      targetType: 'user',
      targetId: userId,
      metadata: result,
    });
    res.json({ data: result });
  });

  router.post('/messages/:id/feedback', async (req, res) => {
    const { id } = parseParams(idParams, req);
    const { rating } = parseBody(feedbackSchema, req);
    await mentor.rateMessage(authOf(req).userId, id, rating);
    res.status(204).end();
  });

  router.post('/hint', burst, async (req, res) => {
    const input = parseBody(hintRequestSchema, req);
    res.json({ data: await mentor.hint(authOf(req).userId, input) });
  });

  router.post('/explain', burst, async (req, res) => {
    const input = parseBody(explainRequestSchema, req);
    res.json({ data: await mentor.explain(authOf(req).userId, input) });
  });

  router.post('/lab-embeddings', burst, async (req, res) => {
    const { texts } = parseBody(labEmbeddingsSchema, req);
    res.json({ data: await mentor.labEmbeddings(authOf(req).userId, texts) });
  });

  return router;
}
