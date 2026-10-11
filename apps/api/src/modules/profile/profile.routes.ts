import { onboardingSchema, updatePreferencesSchema, updateProfileSchema } from '@genpath/shared';
import { Router } from 'express';
import { authOf, requireAuth } from '../../middleware/auth';
import { parseBody } from '../../lib/validate';
import type { Services } from '../../services';

export function profileRouter(services: Services): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json({ data: await services.profile.get(authOf(req).userId) });
  });

  router.patch('/', async (req, res) => {
    const input = parseBody(updateProfileSchema, req);
    res.json({ data: await services.profile.update(authOf(req).userId, input) });
  });

  router.patch('/preferences', async (req, res) => {
    const input = parseBody(updatePreferencesSchema, req);
    res.json({ data: await services.profile.updatePreferences(authOf(req).userId, input) });
  });

  router.post('/onboarding', async (req, res) => {
    const { userId } = authOf(req);
    const input = parseBody(onboardingSchema, req);
    res.json({ data: await services.profile.completeOnboarding(userId, input) });
  });

  return router;
}
