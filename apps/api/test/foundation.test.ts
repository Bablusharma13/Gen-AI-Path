import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnvValidationError, loadConfig } from '../src/config/env';
import { createTestHarness, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});

afterAll(async () => {
  await h.close();
});

describe('health', () => {
  it('reports liveness without touching dependencies', async () => {
    const res = await request(h.app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('reports readiness with real dependency checks', async () => {
    const res = await request(h.app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.mongodb.state).toBe('up');
    expect(res.body.data.checks.redis.state).toBe('not_configured');
    expect(res.body.data.checks.queue.mode).toBe('inline');
    expect(res.body.data.checks.ai).toEqual({ state: 'not_configured', provider: 'none' });
  });
});

describe('request handling', () => {
  it('returns a request id and a JSON 404 for unknown routes', async () => {
    const res = await request(h.app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('propagates a well-formed incoming request id', async () => {
    const res = await request(h.app)
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'trace-12345678');
    expect(res.headers['x-request-id']).toBe('trace-12345678');
  });

  it('replaces a malformed incoming request id', async () => {
    const res = await request(h.app)
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'bad id <script>');
    expect(res.headers['x-request-id']).not.toBe('bad id <script>');
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await request(h.app)
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects oversized bodies with a 413', async () => {
    const res = await request(h.app)
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects MongoDB operator keys in bodies and query strings', async () => {
    const body = await request(h.app)
      .post('/api/v1/health/live')
      .send({ email: { $gt: '' } });
    expect(body.status).toBe(400);

    const query = await request(h.app).get('/api/v1/health/live?$where=1');
    expect(query.status).toBe(400);
  });

  it('sets security headers', async () => {
    const res = await request(h.app).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('allows CORS only for configured origins', async () => {
    const allowed = await request(h.app)
      .get('/api/v1/health/live')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const denied = await request(h.app)
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('environment validation', () => {
  const base = {
    MONGODB_URI: 'mongodb://localhost:27017/x',
    JWT_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
  };

  it('lists every missing required variable', () => {
    try {
      loadConfig({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const problems = (err as EnvValidationError).problems.join('\n');
      expect(problems).toContain('MONGODB_URI');
      expect(problems).toContain('JWT_SECRET');
      expect(problems).toContain('JWT_REFRESH_SECRET');
    }
  });

  it('refuses unsafe production settings', () => {
    try {
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-change-me-change-me-change-me',
        AI_PROVIDER: 'mock',
      });
      expect.unreachable();
    } catch (err) {
      const problems = (err as EnvValidationError).problems.join('\n');
      expect(problems).toContain('JWT_SECRET');
      expect(problems).toContain('AI_PROVIDER');
      expect(problems).toContain('REDIS_URL');
      expect(problems).toContain('MAIL_TRANSPORT');
    }
  });

  it('treats empty values as unset so defaults apply', () => {
    const config = loadConfig({ ...base, COOKIE_SECURE: '', AI_TIMEOUT_MS: '', REDIS_URL: '' });
    expect(config.auth.cookieSecure).toBe(false);
    expect(config.ai.timeoutMs).toBe(60_000);
    expect(config.redisUrl).toBeUndefined();
  });

  it('requires a model for real AI providers', () => {
    expect(() => loadConfig({ ...base, AI_PROVIDER: 'anthropic', AI_API_KEY: 'k' })).toThrow(
      /AI_MODEL/,
    );
  });

  it('never reuses the chat API key for a different embedding vendor', () => {
    const config = loadConfig({
      ...base,
      AI_PROVIDER: 'anthropic',
      AI_API_KEY: 'anthropic-key',
      AI_MODEL: 'some-model',
      AI_EMBEDDING_PROVIDER: 'openai-compatible',
      AI_EMBEDDING_MODEL: 'text-embedding-3-small',
    });
    expect(config.embeddings.apiKey).toBeUndefined();
  });

  it('applies secure cookie defaults in production', () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: 'production',
      REDIS_URL: 'redis://localhost:6379',
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtp://localhost:25',
    });
    expect(config.auth.cookieSecure).toBe(true);
    expect(config.mongo.autoIndex).toBe(false);
  });
});
