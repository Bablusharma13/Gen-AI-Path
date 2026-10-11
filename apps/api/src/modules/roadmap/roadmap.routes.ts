import { roadmapItemParamsSchema, roadmapItemUpdateSchema } from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../middleware/auth';
import { parseBody, parseParams } from '../../lib/validate';
import type { Services } from '../../services';

const resetSchema = z.object({ keepKnown: z.boolean().default(true) });

export function roadmapRouter(services: Services): Router {
  const router = Router();
  // Mounted without a path prefix, so guard each route (a router-level guard would turn
  // unknown URLs into 401s instead of 404s).
  const { roadmap, progress } = services;

  router.get('/roadmap', requireAuth, async (req, res) => {
    res.json({ data: await roadmap.get(authOf(req).userId) });
  });

  router.patch('/roadmap/items/:courseId', requireAuth, async (req, res) => {
    const { courseId } = parseParams(roadmapItemParamsSchema, req);
    const input = parseBody(roadmapItemUpdateSchema, req);
    res.json({ data: await roadmap.updateItem(authOf(req).userId, courseId, input) });
  });

  router.post('/roadmap/reset', requireAuth, async (req, res) => {
    const { keepKnown } = parseBody(resetSchema, req);
    res.json({ data: await roadmap.reset(authOf(req).userId, keepKnown) });
  });

  router.get('/progress/summary', requireAuth, async (req, res) => {
    res.json({ data: await progress.summary(authOf(req).userId) });
  });

  return router;
}
