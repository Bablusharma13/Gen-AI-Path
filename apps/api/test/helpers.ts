import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { buildAi } from '../src/bootstrap';
import { loadConfig, type AppConfig } from '../src/config/env';
import type { AppContext } from '../src/context';
import { UserModel } from '../src/db/models/user.model';
import { InlineJobQueue } from '../src/lib/jobs';
import { createLogger } from '../src/lib/logger';
import { MemoryMailer } from '../src/lib/mailer';
import { LocalObjectStorage } from '../src/lib/storage';
import type { Services } from '../src/services';

export const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
export const WEB_ORIGIN = 'http://localhost:3000';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: TEST_MONGODB_URI,
    JWT_SECRET: 'test-access-secret-0123456789abcdefghijklmnop',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdefghijklmno',
    WEB_URL: WEB_ORIGIN,
    RATE_LIMIT_MULTIPLIER: '100',
    ...overrides,
  });
}

export interface TestHarness {
  app: Express;
  ctx: AppContext;
  services: Services;
  mailer: MemoryMailer;
  dbName: string;
  close: () => Promise<void>;
}

/** Connects to a fresh, uniquely named database and builds the app. Drop it with `close()`. */
export async function createTestHarness(
  overrides: Record<string, string> = {},
  extend?: (ctx: AppContext) => AppContext,
): Promise<TestHarness> {
  const config = testConfig(overrides);
  const dbName = `genpath_ai_test_${randomBytes(6).toString('hex')}`;
  await mongoose.connect(TEST_MONGODB_URI, {
    dbName,
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
  });

  const mailer = new MemoryMailer();
  const logger = createLogger(config);
  const storageDir = path.join(tmpdir(), dbName);
  const base: AppContext = {
    config,
    logger,
    redis: null,
    mailer,
    ...buildAi(config),
    storage: new LocalObjectStorage(storageDir),
    jobs: new InlineJobQueue(logger),
    startedAt: Date.now(),
    version: 'test',
  };
  const ctx = extend ? extend(base) : base;
  const app = createApp(ctx);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return {
    app,
    ctx,
    services: app.locals.services as Services,
    mailer,
    dbName,
    close: async () => {
      if (ctx.jobs instanceof InlineJobQueue) await ctx.jobs.drain();
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

type Agent = ReturnType<typeof request.agent>;

/** A browser-like client: keeps cookies and sends the CSRF header + Origin on unsafe methods. */
export class TestClient {
  constructor(
    readonly agent: Agent,
    private csrf: string,
  ) {}

  static async create(app: Express): Promise<TestClient> {
    const agent = request.agent(app);
    const res = await agent.get('/api/v1/auth/csrf');
    return new TestClient(agent, res.body.data.csrfToken as string);
  }

  get(url: string) {
    return this.agent.get(url);
  }
  post(url: string, body?: object) {
    return this.agent.post(url).set('X-CSRF-Token', this.csrf).set('Origin', WEB_ORIGIN).send(body);
  }
  patch(url: string, body?: object) {
    return this.agent
      .patch(url)
      .set('X-CSRF-Token', this.csrf)
      .set('Origin', WEB_ORIGIN)
      .send(body);
  }
  put(url: string, body?: object) {
    return this.agent.put(url).set('X-CSRF-Token', this.csrf).set('Origin', WEB_ORIGIN).send(body);
  }
  /** POST without a body yet, for multipart uploads (`.field()` / `.attach()`). */
  multipart(url: string) {
    return this.agent.post(url).set('X-CSRF-Token', this.csrf).set('Origin', WEB_ORIGIN);
  }
  delete(url: string) {
    return this.agent.delete(url).set('X-CSRF-Token', this.csrf).set('Origin', WEB_ORIGIN);
  }
}

let counter = 0;
export const STRONG_PASSWORD = 'correct-horse-42';

export async function registerClient(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ client: TestClient; userId: string; email: string }> {
  counter += 1;
  const email =
    overrides.email ?? `learner${counter}-${randomBytes(3).toString('hex')}@example.com`;
  const client = await TestClient.create(app);
  const res = await client.post('/api/v1/auth/register', {
    name: overrides.name ?? `Learner ${counter}`,
    email,
    password: overrides.password ?? STRONG_PASSWORD,
  });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, userId: res.body.data.id as string, email };
}

export async function promote(userId: string, role: 'instructor' | 'org_admin' | 'platform_admin') {
  await UserModel.updateOne({ _id: userId }, { $set: { role } });
}

/** Extracts a cookie value from a Set-Cookie header list. */
export function cookieFrom(
  setCookie: string[] | string | undefined,
  name: string,
): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const entry = list.find((c) => c.startsWith(`${name}=`));
  return entry?.split(';')[0]?.slice(name.length + 1);
}
