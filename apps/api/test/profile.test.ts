import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness, registerClient, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});

afterAll(async () => {
  await h.close();
});

const onboarding = {
  careerGoal: 'genai_app_engineer',
  level: 'beginner',
  experience: 'web_development',
  programmingLanguages: ['typescript', 'python'],
  primaryProgrammingLanguage: 'typescript',
  explanationLanguage: 'hinglish',
  learningStyle: 'code_first',
  dailyMinutes: 60,
};

describe('profile', () => {
  it('requires authentication', async () => {
    expect((await request(h.app).get('/api/v1/profile')).status).toBe(401);
  });

  it('starts with sensible defaults', async () => {
    const { client } = await registerClient(h.app, { name: 'Ravi' });
    const res = await client.get('/api/v1/profile');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Ravi',
      careerGoal: null,
      onboardingCompletedAt: null,
      preferences: {
        explanationLanguage: 'hinglish',
        primaryProgrammingLanguage: 'python',
        theme: 'system',
      },
      stats: { xp: 0, currentStreak: 0 },
    });
  });

  it('completes onboarding and reflects it in /auth/me', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.post('/api/v1/profile/onboarding', onboarding);
    expect(res.status).toBe(200);
    expect(res.body.data.careerGoal).toBe('genai_app_engineer');
    expect(res.body.data.preferences).toMatchObject({
      programmingLanguages: ['typescript', 'python'],
      primaryProgrammingLanguage: 'typescript',
      learningStyle: 'code_first',
      dailyMinutes: 60,
    });
    expect((await client.get('/api/v1/auth/me')).body.data.onboardingCompleted).toBe(true);
  });

  it('rejects a primary language outside the selected languages', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.post('/api/v1/profile/onboarding', {
      ...onboarding,
      primaryProgrammingLanguage: 'javascript',
    });
    expect(res.status).toBe(400);
  });

  it('keeps explanation language and programming language independent', async () => {
    const { client } = await registerClient(h.app);
    await client.post('/api/v1/profile/onboarding', onboarding);

    const lang = await client.patch('/api/v1/profile/preferences', { explanationLanguage: 'hi' });
    expect(lang.status).toBe(200);
    expect(lang.body.data.preferences.explanationLanguage).toBe('hi');
    expect(lang.body.data.preferences.primaryProgrammingLanguage).toBe('typescript');
    expect(lang.body.data.preferences.programmingLanguages).toEqual(['typescript', 'python']);

    const code = await client.patch('/api/v1/profile/preferences', {
      primaryProgrammingLanguage: 'python',
    });
    expect(code.body.data.preferences.primaryProgrammingLanguage).toBe('python');
    expect(code.body.data.preferences.explanationLanguage).toBe('hi');
  });

  it('persists theme and accessibility settings across sessions', async () => {
    const { client, email } = await registerClient(h.app);
    await client.patch('/api/v1/profile/preferences', {
      theme: 'dark',
      reducedMotion: true,
      fontScale: 1.25,
    });
    await client.post('/api/v1/auth/logout');

    const { TestClient, STRONG_PASSWORD } = await import('./helpers');
    const again = await TestClient.create(h.app);
    await again.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
    const res = await again.get('/api/v1/profile');
    expect(res.body.data.preferences).toMatchObject({
      theme: 'dark',
      reducedMotion: true,
      fontScale: 1.25,
    });
  });

  it('refuses a primary language that is not in the new language list', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.patch('/api/v1/profile/preferences', {
      programmingLanguages: ['typescript'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('primaryProgrammingLanguage');
  });

  it('rejects unknown enum values and empty updates', async () => {
    const { client } = await registerClient(h.app);
    expect((await client.patch('/api/v1/profile/preferences', { theme: 'neon' })).status).toBe(400);
    expect((await client.patch('/api/v1/profile/preferences', {})).status).toBe(400);
    expect((await client.patch('/api/v1/profile', { bio: 'x'.repeat(501) })).status).toBe(400);
  });

  it('isolates profiles between users', async () => {
    const a = await registerClient(h.app, { name: 'Alice' });
    const b = await registerClient(h.app, { name: 'Bob' });
    await a.client.patch('/api/v1/profile', { bio: 'Alice private bio' });
    const bProfile = await b.client.get('/api/v1/profile');
    expect(bProfile.body.data.name).toBe('Bob');
    expect(bProfile.body.data.bio).toBe('');
  });
});
