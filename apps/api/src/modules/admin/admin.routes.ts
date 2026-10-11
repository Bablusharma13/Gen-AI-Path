import {
  adminUpdateUserSchema,
  adminUsersQuerySchema,
  auditQuerySchema,
  objectIdSchema,
} from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireRole } from '../../middleware/auth';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import type { Services } from '../../services';

const userParams = z.object({ userId: objectIdSchema });
const usageQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

/** Platform administration. Every route requires the platform_admin role. */
export function adminRouter(services: Services): Router {
  const router = Router();
  router.use(requireRole('platform_admin'));
  const { admin, audit } = services;

  router.get('/overview', async (_req, res) => {
    res.json({ data: await admin.overview() });
  });

  router.get('/users', async (req, res) => {
    res.json(await admin.users(parseQuery(adminUsersQuerySchema, req)));
  });

  router.patch('/users/:userId', async (req, res) => {
    const { userId } = parseParams(userParams, req);
    const change = parseBody(adminUpdateUserSchema, req);
    const user = await admin.updateUser(authOf(req).userId, userId, change);
    await audit.record(req, {
      action: 'admin.user_updated',
      targetType: 'user',
      targetId: userId,
      metadata: { role: change.role ?? null, status: change.status ?? null },
    });
    res.json({ data: user });
  });

  router.get('/ai-usage', async (req, res) => {
    const { days } = parseQuery(usageQuery, req);
    res.json({ data: await admin.aiUsage(days) });
  });

  router.get('/audit-logs', async (req, res) => {
    res.json(await admin.auditLogs(parseQuery(auditQuerySchema, req)));
  });

  router.get('/prompts', (_req, res) => {
    res.json({ data: admin.prompts() });
  });

  return router;
}
