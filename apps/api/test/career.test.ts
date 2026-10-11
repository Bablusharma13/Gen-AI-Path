import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadContent, resolveContentDir } from '../src/content/loader';
import { seedContent } from '../src/content/seed';
import { createTestHarness, registerClient, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
  await seedContent(await loadContent(resolveContentDir()));
});

afterAll(async () => {
  await h.close();
});

const onboarding = {
  careerGoal: 'genai_app_engineer',
  level: 'beginner',
  experience: 'none',
  programmingLanguages: ['python'],
  primaryProgrammingLanguage: 'python',
  explanationLanguage: 'hinglish',
  learningStyle: 'beginner_friendly',
  dailyMinutes: 30,
};

describe('career center', () => {
  it('lists interview questions with key points and empty practice state', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/career/questions');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(20);
    const first = res.body.data[0];
    expect(first.keyPoints.en.length).toBeGreaterThan(1);
    expect(first.practice).toEqual({ status: null, notes: '', updatedAt: null });

    const rag = await client.get('/api/v1/career/questions?category=rag');
    expect(rag.body.data.every((q: { category: string }) => q.category === 'rag')).toBe(true);
    expect((await client.get('/api/v1/career/questions?category=astrology')).status).toBe(400);
  });

  it('saves private practice status and notes per learner', async () => {
    const a = await registerClient(h.app);
    const b = await registerClient(h.app);
    const url = '/api/v1/career/questions/llm-tokens/practice';
    const saved = await a.client.put(url, { status: 'needs_practice', notes: 'Revise BPE' });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ status: 'needs_practice', notes: 'Revise BPE' });

    // Updating status alone keeps the notes; null clears the status.
    expect((await a.client.put(url, { status: 'confident' })).body.data).toMatchObject({
      status: 'confident',
      notes: 'Revise BPE',
    });
    const confident = await a.client.get('/api/v1/career/questions?status=confident');
    expect(confident.body.data.map((q: { id: string }) => q.id)).toEqual(['llm-tokens']);

    // Another learner sees nothing of it.
    const other = await b.client.get('/api/v1/career/questions?status=confident');
    expect(other.body.data).toEqual([]);

    expect((await a.client.put(url, { status: null })).body.data.status).toBeNull();
    expect(
      (await a.client.put('/api/v1/career/questions/nope/practice', { status: 'confident' }))
        .status,
    ).toBe(404);
    expect((await a.client.put(url, { status: 'expert' })).status).toBe(400);
  });

  it('builds a transparent readiness checklist from real progress', async () => {
    const { client } = await registerClient(h.app);
    expect((await client.post('/api/v1/profile/onboarding', onboarding)).status).toBe(200);
    const res = await client.get('/api/v1/career/overview');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.track).toBe('A');
    expect(data.readiness.map((r: { id: string }) => r.id)).toEqual([
      'goal',
      'courses',
      'assessments',
      'project-submitted',
      'project-reviewed',
      'interview',
    ]);
    expect(data.readiness.find((r: { id: string }) => r.id === 'goal').done).toBe(true);
    expect(data.readiness.find((r: { id: string }) => r.id === 'courses').done).toBe(false);
    expect(data.counts.requiredCourses).toBeGreaterThanOrEqual(2);

    await client.post('/api/v1/projects/python-api-assistant/submissions', {
      repoUrl: 'https://github.com/example/ask',
    });
    const after = await client.get('/api/v1/career/overview');
    expect(
      after.body.data.readiness.find((r: { id: string }) => r.id === 'project-submitted').done,
    ).toBe(true);
    expect(after.body.data.counts.projectsSubmitted).toBe(1);
    expect(after.body.data.byCategory.length).toBeGreaterThan(3);
  });

  it('requires authentication', async () => {
    expect((await request(h.app).get('/api/v1/career/overview')).status).toBe(401);
  });
});
