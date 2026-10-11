import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthTokenModel } from '../src/db/models/auth-token.model';
import { ProfileModel } from '../src/db/models/profile.model';
import { SessionModel } from '../src/db/models/session.model';
import { UserModel } from '../src/db/models/user.model';
import {
  cookieFrom,
  createTestHarness,
  registerClient,
  STRONG_PASSWORD,
  TestClient,
  WEB_ORIGIN,
  type TestHarness,
} from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});

afterAll(async () => {
  await h.close();
});

function tokenFromMail(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error('no token in email');
  return match[1];
}

describe('registration', () => {
  it('creates the account, profile and session cookies without leaking secrets', async () => {
    const client = await TestClient.create(h.app);
    const res = await client.post('/api/v1/auth/register', {
      name: 'Asha',
      email: 'Asha@Example.com',
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'asha@example.com',
      name: 'Asha',
      role: 'student',
      emailVerified: false,
      onboardingCompleted: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('gp_at='));
    const refresh = cookies.find((c) => c.startsWith('gp_rt='));
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/SameSite=Lax/);
    expect(refresh).toMatch(/HttpOnly/);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(refresh).toMatch(/SameSite=Strict/);

    const stored = await UserModel.findOne({ email: 'asha@example.com' })
      .select('+passwordHash')
      .lean();
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await ProfileModel.exists({ userId: stored?._id })).toBeTruthy();
    expect(h.mailer.lastTo('asha@example.com')?.subject).toMatch(/Verify/);
  });

  it('rejects duplicate emails', async () => {
    const { email } = await registerClient(h.app);
    const client = await TestClient.create(h.app);
    const res = await client.post('/api/v1/auth/register', {
      name: 'Dup',
      email: email.toUpperCase(),
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(409);
  });

  it('returns field-level validation errors', async () => {
    const client = await TestClient.create(h.app);
    const res = await client.post('/api/v1/auth/register', {
      name: '',
      email: 'nope',
      password: 'short',
    });
    expect(res.status).toBe(400);
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('login and session', () => {
  it('uses the same error for unknown email and wrong password', async () => {
    const { email } = await registerClient(h.app);
    const client = await TestClient.create(h.app);
    const wrong = await client.post('/api/v1/auth/login', { email, password: 'wrong-password-1' });
    const unknown = await client.post('/api/v1/auth/login', {
      email: 'ghost@example.com',
      password: 'wrong-password-1',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects NoSQL operator payloads', async () => {
    const client = await TestClient.create(h.app);
    const res = await client.post('/api/v1/auth/login', {
      email: { $ne: null },
      password: { $ne: null },
    });
    expect(res.status).toBe(400);
  });

  it('signs in and exposes /auth/me only with a valid session', async () => {
    const { email } = await registerClient(h.app);
    expect((await request(h.app).get('/api/v1/auth/me')).status).toBe(401);

    const client = await TestClient.create(h.app);
    const login = await client.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
    const me = await client.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
  });

  it('rejects a tampered access token', async () => {
    const { client } = await registerClient(h.app);
    const me = await client.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    const res = await request(h.app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'gp_at=eyJhbGciOiJub25lIn0.e30.');
    expect(res.status).toBe(401);
  });

  it('logout revokes the session server-side, even for a still-valid access token', async () => {
    const { email } = await registerClient(h.app);
    const client = await TestClient.create(h.app);
    const login = await client.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
    const access = cookieFrom(login.headers['set-cookie'] as unknown as string[], 'gp_at');
    const withToken = () => request(h.app).get('/api/v1/auth/me').set('Cookie', `gp_at=${access}`);
    expect((await withToken()).status).toBe(200);

    expect((await client.post('/api/v1/auth/logout')).status).toBe(204);
    // Replaying the old (unexpired) access token after logout must fail.
    expect((await withToken()).status).toBe(401);
  });

  it('blocks suspended accounts immediately', async () => {
    const { client, userId } = await registerClient(h.app);
    await UserModel.updateOne({ _id: userId }, { $set: { status: 'suspended' } });
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('requires the double-submit token on unsafe requests', async () => {
    const agent = request.agent(h.app);
    await agent.get('/api/v1/auth/csrf');
    const res = await agent.post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects requests from foreign origins even with a token', async () => {
    const agent = request.agent(h.app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    const res = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects a header that does not match the cookie', async () => {
    const agent = request.agent(h.app);
    await agent.get('/api/v1/auth/csrf');
    const res = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', 'x'.repeat(43))
      .set('Origin', WEB_ORIGIN)
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and keeps the session alive', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.post('/api/v1/auth/refresh');
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookieFrom(cookies, 'gp_rt')).toBeTruthy();
    expect(cookieFrom(cookies, 'gp_at')).toBeTruthy();
    expect((await client.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('treats reuse of a rotated token as theft and revokes the session', async () => {
    const reg = await registerClient(h.app);
    const loginClient = await TestClient.create(h.app);
    const login = await loginClient.post('/api/v1/auth/login', {
      email: reg.email,
      password: STRONG_PASSWORD,
    });
    const stolen = cookieFrom(login.headers['set-cookie'] as unknown as string[], 'gp_rt');
    expect(stolen).toBeTruthy();

    // Legitimate rotation by the real user.
    expect((await loginClient.post('/api/v1/auth/refresh')).status).toBe(200);

    // Within the grace window a replay is tolerated (concurrent tabs) but grants nothing new.
    const csrf = 'c'.repeat(43);
    const replayStolen = () =>
      request(h.app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `gp_rt=${stolen}; gp_csrf=${csrf}`)
        .set('X-CSRF-Token', csrf)
        .set('Origin', WEB_ORIGIN);
    const grace = await replayStolen();
    expect(grace.status).toBe(200);
    expect(cookieFrom(grace.headers['set-cookie'] as unknown as string[], 'gp_at')).toBeUndefined();

    // After the grace window the replay revokes the whole session.
    await SessionModel.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    const replay = await replayStolen();
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');

    // The legitimate user's session is now revoked too.
    expect((await loginClient.get('/api/v1/auth/me')).status).toBe(401);
    expect((await loginClient.post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('fails cleanly without a refresh cookie', async () => {
    const client = await TestClient.create(h.app);
    const res = await client.post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('email verification and password reset', () => {
  it('verifies email with a single-use token', async () => {
    const { client, email } = await registerClient(h.app);
    const token = tokenFromMail(h.mailer.lastTo(email)?.text ?? '');
    const verify = await client.post('/api/v1/auth/verify-email', { token });
    expect(verify.status).toBe(200);
    expect((await client.get('/api/v1/auth/me')).body.data.emailVerified).toBe(true);
    const again = await client.post('/api/v1/auth/verify-email', { token });
    expect(again.status).toBe(400);
  });

  it('does not reveal whether an account exists', async () => {
    const { email } = await registerClient(h.app);
    const client = await TestClient.create(h.app);
    const known = await client.post('/api/v1/auth/forgot-password', { email });
    const unknown = await client.post('/api/v1/auth/forgot-password', {
      email: 'nobody@example.com',
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('resets the password, revokes every session and burns the token', async () => {
    const { client, email } = await registerClient(h.app);
    const anon = await TestClient.create(h.app);
    await anon.post('/api/v1/auth/forgot-password', { email });
    const token = tokenFromMail(h.mailer.lastTo(email)?.text ?? '');

    const reset = await anon.post('/api/v1/auth/reset-password', {
      token,
      password: 'brand-new-pass-9',
    });
    expect(reset.status).toBe(200);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);

    const reuse = await anon.post('/api/v1/auth/reset-password', {
      token,
      password: 'another-pass-77',
    });
    expect(reuse.status).toBe(400);

    const oldLogin = await anon.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await anon.post('/api/v1/auth/login', { email, password: 'brand-new-pass-9' });
    expect(newLogin.status).toBe(200);
  });

  it('stores only hashes of email tokens', async () => {
    const { email } = await registerClient(h.app);
    const token = tokenFromMail(h.mailer.lastTo(email)?.text ?? '');
    expect(await AuthTokenModel.exists({ tokenHash: token })).toBeNull();
  });

  it('changes password with the current password and keeps only the current session', async () => {
    const reg = await registerClient(h.app);
    const other = await TestClient.create(h.app);
    await other.post('/api/v1/auth/login', { email: reg.email, password: STRONG_PASSWORD });

    const bad = await reg.client.post('/api/v1/auth/change-password', {
      currentPassword: 'wrong-one-123',
      newPassword: 'another-good-1',
    });
    expect(bad.status).toBe(401);

    const ok = await reg.client.post('/api/v1/auth/change-password', {
      currentPassword: STRONG_PASSWORD,
      newPassword: 'another-good-1',
    });
    expect(ok.status).toBe(200);
    expect((await reg.client.get('/api/v1/auth/me')).status).toBe(200);
    expect((await other.get('/api/v1/auth/me')).status).toBe(401);
  });
});
