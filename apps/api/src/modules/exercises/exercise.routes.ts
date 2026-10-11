import { contentIdSchema } from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../middleware/auth';
import { parseBody, parseParams } from '../../lib/validate';
import type { Services } from '../../services';
import { exerciseAttemptSchema } from './exercise.service';

const params = z.object({ exerciseId: contentIdSchema });

export function exerciseRouter(services: Services): Router {
  const router = Router();
  router.use(requireAuth);
  const { exercises } = services;

  router.get('/:exerciseId', async (req, res) => {
    const { exerciseId } = parseParams(params, req);
    res.json({ data: await exercises.get(exerciseId, authOf(req).userId) });
  });

  router.post('/:exerciseId/attempts', async (req, res) => {
    const { exerciseId } = parseParams(params, req);
    const input = parseBody(exerciseAttemptSchema, req);
    res
      .status(201)
      .json({ data: await exercises.recordAttempt(authOf(req).userId, exerciseId, input) });
  });

  router.get('/:exerciseId/solution', async (req, res) => {
    const { exerciseId } = parseParams(params, req);
    res.json({ data: await exercises.solution(authOf(req).userId, exerciseId) });
  });

  return router;
}
