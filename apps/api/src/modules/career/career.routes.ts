import { contentIdSchema, interviewPracticeSchema, interviewQuerySchema } from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../middleware/auth';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import type { Services } from '../../services';

const questionParams = z.object({ questionId: contentIdSchema });

export function careerRouter(services: Services): Router {
  const router = Router();
  router.use(requireAuth);
  const { career } = services;

  router.get('/overview', async (req, res) => {
    res.json({ data: await career.overview(authOf(req).userId) });
  });

  router.get('/questions', async (req, res) => {
    const filters = parseQuery(interviewQuerySchema, req);
    res.json({ data: await career.listQuestions(authOf(req).userId, filters) });
  });

  router.put('/questions/:questionId/practice', async (req, res) => {
    const { questionId } = parseParams(questionParams, req);
    const input = parseBody(interviewPracticeSchema, req);
    res.json({ data: await career.setPractice(authOf(req).userId, questionId, input) });
  });

  return router;
}
