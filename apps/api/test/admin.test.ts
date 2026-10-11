import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/db/models/audit-log.model';
import { UserModel } from '../src/db/models/user.model';
import {
  createTestHarness,
  promote,
  registerClient,
  type TestClient,
  type TestHarness,
} from './helpers';

let h: TestHarness;
let admin: TestClient;
let adminId: string;

beforeAll(async () => {
  h = await createTestHarness();
  const a = await registerClient(h.app, { name: 'Platform Admin' });
  await promote(a.userId, 'platform_admin');
  admin = a.client;
  adminId = a.userId;
});

afterAll(async () => {
  await h.close();
});

describe('admin access control', () => {
  it('rejects anonymous users, students, instructors and org admins', async () => {
    expect((await request(h.app).get('/api/v1/admin/overview')).status).toBe(401);
    for (const role of [null, 'instructor', 'org_admin'] as const) {
      const u = await registerClient(h.app);
      if (role) await promote(u.userId, role);
      for (const url of [
        '/api/v1/admin/overview',
        '/api/v1/admin/users',
        '/api/v1/admin/audit-logs',
        '/api/v1/admin/ai-usage',
      ]) {
        expect((await u.client.get(url)).status, `${role ?? 'student'} ${url}`).toBe(403);
      }
      expect(
        (await u.client.patch(`/api/v1/admin/users/${u.userId}`, { role: 'platform_admin' }))
          .status,
      ).toBe(403);
    }
  });

  it('ignores role fields smuggled into profile updates', async () => {
    const u = await registerClient(h.app);
    const res = await u.client.patch('/api/v1/profile', {
      name: 'Sneaky',
      role: 'platform_admin',
      status: 'active',
    });
    expect(res.status).toBe(200);
    expect((await UserModel.findById(u.userId).lean())?.role).toBe('student');
  });

  it('rejects MongoDB operators in bodies and query strings', async () => {
    const login = await request(h.app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect([400, 403]).toContain(login.status);
    const nested = await admin.patch(`/api/v1/admin/users/${adminId}`, {
      role: { $ne: 'student' },
    });
    expect(nested.status).toBe(400);

    // Express 5's simple query parser never builds objects: bracket keys stay literal strings and
    // are dropped by validation, so `role[$in]=…` is ignored rather than reaching MongoDB.
    const all = await admin.get('/api/v1/admin/users?limit=100');
    const smuggled = await admin.get('/api/v1/admin/users?limit=100&role[$in]=student&q[$ne]=x');
    expect(smuggled.status).toBe(200);
    expect(smuggled.body.data).toHaveLength(all.body.data.length);
  });
});

describe('admin features', () => {
  it('returns an overview built from real counts', async () => {
    const res = await admin.get('/api/v1/admin/overview');
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o.users.total).toBe(await UserModel.countDocuments());
    expect(o.users.byRole.platform_admin).toBe(1);
    expect(o.ai).toMatchObject({
      provider: 'none',
      requestsLast30Days: 0,
      costLast30DaysUsd: null,
    });
    expect(o.knowledge).toEqual({ organizations: 0, documents: 0, chunks: 0, failedDocuments: 0 });
  });

  it('lists, searches and paginates users without exposing password hashes', async () => {
    await registerClient(h.app, { name: 'Zoya Searchable', email: 'zoya.search@example.com' });
    const search = await admin.get('/api/v1/admin/users?q=zoya.search');
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0]).toMatchObject({
      name: 'Zoya Searchable',
      role: 'student',
      status: 'active',
    });
    expect(JSON.stringify(search.body)).not.toContain('passwordHash');
    // Regex metacharacters are treated literally.
    expect(
      (await admin.get(`/api/v1/admin/users?q=${encodeURIComponent('.*')}`)).body.data,
    ).toHaveLength(0);

    const first = await admin.get('/api/v1/admin/users?limit=2');
    expect(first.body.data).toHaveLength(2);
    expect(first.body.page.nextCursor).toBeTruthy();
    const second = await admin.get(
      `/api/v1/admin/users?limit=2&cursor=${first.body.page.nextCursor}`,
    );
    const ids = [...first.body.data, ...second.body.data].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('changes roles, suspends users (revoking sessions) and audits both', async () => {
    const target = await registerClient(h.app, { name: 'Target User' });
    const promoted = await admin.patch(`/api/v1/admin/users/${target.userId}`, {
      role: 'instructor',
    });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('instructor');
    // The new role applies on the very next request.
    expect((await target.client.get('/api/v1/auth/me')).body.data.role).toBe('instructor');

    expect(
      (await admin.patch(`/api/v1/admin/users/${target.userId}`, { status: 'suspended' })).status,
    ).toBe(200);
    expect((await target.client.get('/api/v1/auth/me')).status).toBe(401);
    expect((await target.client.post('/api/v1/auth/refresh')).status).toBe(401);

    const logs = await admin.get('/api/v1/admin/audit-logs?action=admin.user_updated');
    expect(logs.body.data.length).toBeGreaterThanOrEqual(2);
    expect(logs.body.data[0]).toMatchObject({
      actorName: 'Platform Admin',
      targetType: 'user',
      targetId: target.userId,
    });
    expect(
      await AuditLogModel.countDocuments({ action: 'admin.user_updated', targetId: target.userId }),
    ).toBe(2);
  });

  it('prevents admins from changing their own role or status', async () => {
    expect((await admin.patch(`/api/v1/admin/users/${adminId}`, { role: 'student' })).status).toBe(
      403,
    );
    expect(
      (await admin.patch(`/api/v1/admin/users/${adminId}`, { status: 'suspended' })).status,
    ).toBe(403);

    // Another admin can demote this one; the acting admin always remains, so access is never lost.
    const second = await registerClient(h.app, { name: 'Second Admin' });
    await promote(second.userId, 'platform_admin');
    expect(
      (await admin.patch(`/api/v1/admin/users/${second.userId}`, { role: 'instructor' })).status,
    ).toBe(200);
    expect((await second.client.get('/api/v1/admin/overview')).status).toBe(403);
    expect((await admin.get('/api/v1/admin/overview')).status).toBe(200);
  });

  it('reports AI usage per day, feature and model, and lists the prompt catalogue', async () => {
    const usage = await (await loginAsActiveAdmin()).get('/api/v1/admin/ai-usage?days=7');
    expect(usage.status).toBe(200);
    expect(usage.body.data.days).toHaveLength(7);
    expect(usage.body.data.days.every((d: { requests: number }) => d.requests === 0)).toBe(true);

    const prompts = await (await loginAsActiveAdmin()).get('/api/v1/admin/prompts');
    expect(prompts.body.data.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(['mentor.chat', 'mentor.hint', 'mentor.explain', 'rag.answer']),
    );
  });
});

async function loginAsActiveAdmin(): Promise<TestClient> {
  const u = await registerClient(h.app);
  await promote(u.userId, 'platform_admin');
  return u.client;
}
