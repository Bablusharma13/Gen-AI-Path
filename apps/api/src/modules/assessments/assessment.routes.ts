import { attemptInputSchema, contentIdSchema } from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../middleware/auth';
import type { LimiterFactory } from '../../middleware/rate-limit';
import { parseBody, parseParams } from '../../lib/validate';
import type { Services } from '../../services';

const params = z.object({ assessmentId: contentIdSchema });

export function assessmentRouter(
  services: Services,
  limiter: LimiterFactory,
  multiplier: number,
): Router {
  const router = Router();
  router.use(requireAuth);
  const { assessments } = services;
  const submitLimit = limiter({
    name: 'assessment-submit',
    windowMs: 60_000,
    limit: 20 * multiplier,
    perUser: true,
  });

  router.get('/', async (req, res) => {
    res.json({ data: await assessments.list(authOf(req).userId) });
  });

  router.get('/:assessmentId', async (req, res) => {
    const { assessmentId } = parseParams(params, req);
    res.json({ data: await assessments.get(assessmentId, authOf(req).userId) });
  });

  router.get('/:assessmentId/attempts', async (req, res) => {
    const { assessmentId } = parseParams(params, req);
    res.json({ data: await assessments.history(authOf(req).userId, assessmentId) });
  });

  router.post('/:assessmentId/attempts', submitLimit, async (req, res) => {
    const { assessmentId } = parseParams(params, req);
    const input = parseBody(attemptInputSchema, req);
    res
      .status(201)
      .json({ data: await assessments.submit(authOf(req).userId, assessmentId, input) });
  });

  return router;
}
