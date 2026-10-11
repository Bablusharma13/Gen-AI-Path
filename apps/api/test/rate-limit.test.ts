import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness, registerClient, TestClient, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  // Real production limits (multiplier 1).
  h = await createTestHarness({ RATE_LIMIT_MULTIPLIER: '1' });
});

afterAll(async () => {
  await h.close();
});

describe('rate limiting', () => {
  it('throttles repeated sign-in attempts against one account', async () => {
    const { email } = await registerClient(h.app);
    const client = await TestClient.create(h.app);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await client.post('/api/v1/auth/login', { email, password: `wrong-guess-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('returns the standard error envelope and RateLimit headers', async () => {
    const client = await TestClient.create(h.app);
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await client.post('/api/v1/auth/forgot-password', { email: 'target@example.com' });
    }
    expect(last?.status).toBe(429);
    expect(last?.body.error.code).toBe('RATE_LIMITED');
    expect(last?.headers['ratelimit-policy'] ?? last?.headers['ratelimit']).toBeTruthy();
  });
});
