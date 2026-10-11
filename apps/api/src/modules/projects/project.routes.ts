import {
  contentIdSchema,
  milestoneToggleSchema,
  objectIdSchema,
  projectSubmissionSchema,
  submissionReviewSchema,
} from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth, requireRole } from '../../middleware/auth';
import type { LimiterFactory } from '../../middleware/rate-limit';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import type { Services } from '../../services';

const projectParams = z.object({ projectId: contentIdSchema });
const milestoneParams = z.object({ projectId: contentIdSchema, milestoneId: contentIdSchema });
const submissionParams = z.object({ submissionId: objectIdSchema });
const queueQuery = z.object({ status: z.enum(['submitted', 'reviewed']).default('submitted') });

const REVIEWERS = ['instructor', 'platform_admin'] as const;

export function projectRouter(
  services: Services,
  limiter: LimiterFactory,
  multiplier: number,
): Router {
  const router = Router();
  router.use(requireAuth);
  const { projects, audit } = services;
  const submitLimit = limiter({
    name: 'project-submit',
    windowMs: 60 * 60_000,
    limit: 10 * multiplier,
    perUser: true,
  });

  router.get('/', async (req, res) => {
    res.json({ data: await projects.list(authOf(req).userId) });
  });

  // Reviewer routes come before `/:projectId` so "review" is never parsed as a project id.
  router.get('/review/submissions', requireRole(...REVIEWERS), async (req, res) => {
    const { status } = parseQuery(queueQuery, req);
    res.json({ data: await projects.reviewQueue(status) });
  });

  router.post('/review/submissions/:submissionId', requireRole(...REVIEWERS), async (req, res) => {
    const { submissionId } = parseParams(submissionParams, req);
    const { feedback } = parseBody(submissionReviewSchema, req);
    const result = await projects.review(authOf(req).userId, submissionId, feedback);
    await audit.record(req, {
      action: 'project.submission_reviewed',
      targetType: 'projectSubmission',
      targetId: submissionId,
    });
    res.json({ data: result });
  });

  router.get('/:projectId', async (req, res) => {
    const { projectId } = parseParams(projectParams, req);
    res.json({ data: await projects.get(projectId, authOf(req).userId) });
  });

  router.post('/:projectId/start', async (req, res) => {
    const { projectId } = parseParams(projectParams, req);
    res.json({ data: await projects.start(authOf(req).userId, projectId) });
  });

  router.put('/:projectId/milestones/:milestoneId', async (req, res) => {
    const { projectId, milestoneId } = parseParams(milestoneParams, req);
    const { completed } = parseBody(milestoneToggleSchema, req);
    res.json({
      data: await projects.setMilestone(authOf(req).userId, projectId, milestoneId, completed),
    });
  });

  router.post('/:projectId/submissions', submitLimit, async (req, res) => {
    const { projectId } = parseParams(projectParams, req);
    const input = parseBody(projectSubmissionSchema, req);
    res.status(201).json({ data: await projects.submit(authOf(req).userId, projectId, input) });
  });

  return router;
}
