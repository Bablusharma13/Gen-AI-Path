import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadContent, resolveContentDir } from '../src/content/loader';
import { seedContent } from '../src/content/seed';
import { ProfileModel } from '../src/db/models/profile.model';
import { createTestHarness, promote, registerClient, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
  await seedContent(await loadContent(resolveContentDir()));
});

afterAll(async () => {
  await h.close();
});

const xpOf = async (userId: string) =>
  (await ProfileModel.findOne({ userId }).lean())?.stats?.xp ?? 0;

describe('projects', () => {
  it('lists published projects in order with not_started status', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/projects');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids.slice(0, 3)).toEqual([
      'python-api-assistant',
      'rag-docs-assistant',
      'resume-analyzer',
    ]);
    expect(res.body.data[0]).toMatchObject({ status: 'not_started', completedMilestones: 0 });
    expect(res.body.data[0].milestoneCount).toBeGreaterThanOrEqual(2);
  });

  it('returns the full brief with prerequisite lessons and rubric', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/projects/python-api-assistant');
    expect(res.status).toBe(200);
    expect(res.body.data.requirements.en.length).toBeGreaterThan(3);
    expect(res.body.data.rubric.reduce((s: number, r: { points: number }) => s + r.points, 0)).toBe(
      100,
    );
    expect(res.body.data.lessons.map((l: { id: string }) => l.id)).toContain('py-http-apis');
    expect(res.body.data.lessons[0]).toHaveProperty('completed', false);
    expect((await client.get('/api/v1/projects/no-such-project')).status).toBe(404);
  });

  it('tracks milestones and awards XP only once per milestone', async () => {
    const { client, userId } = await registerClient(h.app);
    const url = '/api/v1/projects/python-api-assistant/milestones/config';
    const first = await client.put(url, { completed: true });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ completedMilestones: 1, xpAwarded: 25 });
    // Double click: no duplicate, no extra XP.
    expect((await client.put(url, { completed: true })).body.data).toEqual({
      completedMilestones: 1,
      xpAwarded: 0,
    });
    // Untick and retick: still no extra XP.
    expect((await client.put(url, { completed: false })).body.data.completedMilestones).toBe(0);
    expect((await client.put(url, { completed: true })).body.data.xpAwarded).toBe(0);
    expect(await xpOf(userId)).toBe(25);

    const detail = await client.get('/api/v1/projects/python-api-assistant');
    expect(detail.body.data.status).toBe('in_progress');
    expect(
      detail.body.data.milestones.find((m: { id: string }) => m.id === 'config').completedAt,
    ).toBeTruthy();
    expect(
      (
        await client.put('/api/v1/projects/python-api-assistant/milestones/nope', {
          completed: true,
        })
      ).status,
    ).toBe(404);
  });

  it('accepts submissions with public URLs and validates the checklist against the rubric', async () => {
    const { client, userId } = await registerClient(h.app);
    const url = '/api/v1/projects/resume-analyzer/submissions';
    expect((await client.post(url, { repoUrl: 'http://localhost:3000/repo' })).status).toBe(400);
    expect((await client.post(url, { repoUrl: 'javascript:alert(1)' })).status).toBe(400);
    const badCriterion = await client.post(url, {
      repoUrl: 'https://github.com/example/resume-analyzer',
      checklist: [{ criterionId: 'made-up', selfAssessed: true }],
    });
    expect(badCriterion.status).toBe(400);

    const ok = await client.post(url, {
      repoUrl: 'https://github.com/example/resume-analyzer',
      notes: 'Schema-first, 10 fixtures',
      checklist: [{ criterionId: 'validity', selfAssessed: true }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ status: 'submitted', feedback: null, demoUrl: null });
    expect(await xpOf(userId)).toBe(50);
    // Resubmitting is allowed but earns no more XP.
    await client.post(url, { repoUrl: 'https://github.com/example/resume-analyzer' });
    expect(await xpOf(userId)).toBe(50);

    const detail = await client.get('/api/v1/projects/resume-analyzer');
    expect(detail.body.data.status).toBe('submitted');
    expect(detail.body.data.submissions).toHaveLength(2);
  });

  it('lets instructors review submissions, but not students or the author', async () => {
    const learner = await registerClient(h.app, { name: 'Asha Learner' });
    const sub = await learner.client.post('/api/v1/projects/rag-docs-assistant/submissions', {
      repoUrl: 'https://github.com/example/rag-docs',
    });
    const submissionId = sub.body.data.id as string;

    const student = await registerClient(h.app);
    expect((await student.client.get('/api/v1/projects/review/submissions')).status).toBe(403);
    expect(
      (
        await student.client.post(`/api/v1/projects/review/submissions/${submissionId}`, {
          feedback: 'Looks good to me.',
        })
      ).status,
    ).toBe(403);

    // The author cannot review their own work even with a reviewer role.
    await promote(learner.userId, 'instructor');
    const self = await learner.client.post(`/api/v1/projects/review/submissions/${submissionId}`, {
      feedback: 'I approve my own work.',
    });
    expect(self.status).toBe(403);

    const reviewer = await registerClient(h.app, { name: 'Ravi Reviewer' });
    await promote(reviewer.userId, 'instructor');
    const queue = await reviewer.client.get('/api/v1/projects/review/submissions');
    expect(queue.status).toBe(200);
    const item = queue.body.data.find((s: { id: string }) => s.id === submissionId);
    expect(item).toMatchObject({ learnerName: 'Asha Learner', projectId: 'rag-docs-assistant' });
    expect(JSON.stringify(item)).not.toContain('@example.com');

    expect(
      (
        await reviewer.client.post(`/api/v1/projects/review/submissions/${submissionId}`, {
          feedback: 'ok',
        })
      ).status,
    ).toBe(400);
    const reviewed = await reviewer.client.post(
      `/api/v1/projects/review/submissions/${submissionId}`,
      {
        feedback: 'Great citation validation. Add the not-found threshold to the README.',
      },
    );
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data).toMatchObject({ status: 'reviewed', reviewerName: 'Ravi Reviewer' });

    const detail = await learner.client.get('/api/v1/projects/rag-docs-assistant');
    expect(detail.body.data.status).toBe('reviewed');
    expect(detail.body.data.submissions[0].feedback).toContain('citation validation');
  });

  it('requires authentication', async () => {
    const res = await (await import('supertest')).default(h.app).get('/api/v1/projects');
    expect(res.status).toBe(401);
  });
});
