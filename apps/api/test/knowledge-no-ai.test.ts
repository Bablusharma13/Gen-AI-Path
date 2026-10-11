import { afterAll, beforeAll, expect, it } from 'vitest';
import type { InlineJobQueue } from '../src/lib/jobs';
import { createTestHarness, promote, registerClient, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness({ AI_PROVIDER: 'none' });
});

afterAll(async () => {
  await h.close();
});

it('returns the relevant passages without an AI provider, clearly not as an AI answer', async () => {
  const admin = await registerClient(h.app);
  await promote(admin.userId, 'instructor');
  const org = await admin.client.post('/api/v1/orgs', { name: 'No AI Co' });
  const orgId = org.body.data.id as string;
  const up = await admin.client
    .multipart(`/api/v1/orgs/${orgId}/documents`)
    .attach(
      'file',
      Buffer.from('# Refunds\n\nCustomers can request a full refund within 14 days of purchase.'),
      {
        filename: 'refund.md',
        contentType: 'text/markdown',
      },
    );
  expect(up.status).toBe(201);
  await (h.ctx.jobs as InlineJobQueue).drain();

  const res = await admin.client.post(`/api/v1/orgs/${orgId}/ask`, {
    question: 'How many days for a refund?',
  });
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({
    found: true,
    reason: 'ai_not_configured',
    answer: null,
    model: null,
    isMock: false,
  });
  expect(res.body.data.citations[0].excerpt).toContain('14 days');
});
