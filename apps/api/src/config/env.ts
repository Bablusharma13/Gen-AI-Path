import { priceTableSchema, type PriceTable } from '@genpath/ai-core/llm';
import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const WEAK_SECRET_HINTS = ['change-me', 'changeme', 'secret', 'password', 'example'];

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_URL: z.url().default('http://localhost:3000'),
    CORS_ORIGINS: csv,
    TRUST_PROXY: z.string().default('loopback'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Scales every rate limit (tests use a high value; keep 1 in production). */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_AUTO_INDEX: booleanish.optional(),
    REDIS_URL: optionalString,

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    COOKIE_SECURE: booleanish.optional(),

    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: optionalString,
    MAIL_FROM: z.string().default('GenPath AI <no-reply@genpath.local>'),

    AI_PROVIDER: z
      .enum(['none', 'mock', 'openai-compatible', 'anthropic', 'gemini'])
      .default('none'),
    AI_API_KEY: optionalString,
    AI_BASE_URL: optionalString.pipe(z.url().optional()),
    AI_MODEL: optionalString,
    AI_FALLBACK_MODEL: optionalString,
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(16_000).default(1500),
    AI_MAX_INPUT_CHARS: z.coerce.number().int().min(500).max(100_000).default(8000),
    AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(100_000).default(100),
    /** Anthropic server-side refusal fallback (fallbacks: "default") on supported models. */
    AI_ANTHROPIC_SERVER_FALLBACK: booleanish.default(true),
    /** Optional per-model prices (USD per 1M tokens), e.g. {"gpt-4o-mini":{"input":0.15,"output":0.6}}. */
    AI_PRICING_JSON: optionalString,

    AI_EMBEDDING_PROVIDER: z
      .enum(['local-hash', 'openai-compatible', 'gemini'])
      .default('local-hash'),
    AI_EMBEDDING_MODEL: optionalString,
    AI_EMBEDDING_API_KEY: optionalString,
    AI_EMBEDDING_BASE_URL: optionalString.pipe(z.url().optional()),

    VECTOR_STORE_PROVIDER: z.enum(['mongodb-local', 'atlas']).default('mongodb-local'),
    ATLAS_VECTOR_INDEX_NAME: z.string().default('knowledge_chunks_vector'),

    OBJECT_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    OBJECT_STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),
    OBJECT_STORAGE_ENDPOINT: optionalString,
    OBJECT_STORAGE_REGION: z.string().default('us-east-1'),
    OBJECT_STORAGE_BUCKET: optionalString,
    OBJECT_STORAGE_ACCESS_KEY: optionalString,
    OBJECT_STORAGE_SECRET_KEY: optionalString,
    /** Curriculum content directory (defaults to <repo>/content). */
    CONTENT_DIR: optionalString,
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    /** Minimum hybrid retrieval score for a passage to count as relevant. Tune with labelled questions. */
    KB_MIN_SCORE: z.coerce.number().min(0).max(1).optional(),
    KB_CHUNK_WORDS: z.coerce.number().int().min(40).max(1000).default(180),
    KB_CHUNK_OVERLAP_WORDS: z.coerce.number().int().min(0).max(200).default(30),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      issue('JWT_REFRESH_SECRET', 'must differ from JWT_SECRET');
    }
    if (env.AI_PROVIDER !== 'none' && env.AI_PROVIDER !== 'mock' && !env.AI_MODEL) {
      issue('AI_MODEL', `is required when AI_PROVIDER=${env.AI_PROVIDER}`);
    }
    if (env.AI_PRICING_JSON) {
      try {
        if (!priceTableSchema.safeParse(JSON.parse(env.AI_PRICING_JSON)).success) {
          issue(
            'AI_PRICING_JSON',
            'must map model ids to {input, output} prices in USD per 1M tokens',
          );
        }
      } catch {
        issue('AI_PRICING_JSON', 'is not valid JSON');
      }
    }
    if ((env.AI_PROVIDER === 'anthropic' || env.AI_PROVIDER === 'gemini') && !env.AI_API_KEY) {
      issue('AI_API_KEY', `is required when AI_PROVIDER=${env.AI_PROVIDER}`);
    }
    if (env.AI_PROVIDER === 'openai-compatible' && !env.AI_API_KEY && !env.AI_BASE_URL) {
      issue(
        'AI_API_KEY',
        'is required for OpenAI (or set AI_BASE_URL for a local server such as Ollama)',
      );
    }
    if (env.AI_EMBEDDING_PROVIDER !== 'local-hash' && !env.AI_EMBEDDING_MODEL) {
      issue(
        'AI_EMBEDDING_MODEL',
        `is required when AI_EMBEDDING_PROVIDER=${env.AI_EMBEDDING_PROVIDER}`,
      );
    }
    if (env.KB_CHUNK_OVERLAP_WORDS >= env.KB_CHUNK_WORDS) {
      issue('KB_CHUNK_OVERLAP_WORDS', 'must be smaller than KB_CHUNK_WORDS');
    }
    if (env.OBJECT_STORAGE_DRIVER === 's3') {
      for (const key of [
        'OBJECT_STORAGE_BUCKET',
        'OBJECT_STORAGE_ACCESS_KEY',
        'OBJECT_STORAGE_SECRET_KEY',
      ] as const) {
        if (!env[key]) issue(key, 'is required when OBJECT_STORAGE_DRIVER=s3');
      }
    }
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      issue('SMTP_URL', 'is required when MAIL_TRANSPORT=smtp');
    }

    if (env.NODE_ENV === 'production') {
      for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        const lower = env[key].toLowerCase();
        if (WEAK_SECRET_HINTS.some((hint) => lower.includes(hint))) {
          issue(key, 'looks like a placeholder; generate a random secret for production');
        }
      }
      if (env.AI_PROVIDER === 'mock')
        issue('AI_PROVIDER', 'mock provider is not allowed in production');
      if (!env.REDIS_URL) issue('REDIS_URL', 'is required in production (rate limits, job queue)');
      if (env.MAIL_TRANSPORT === 'log')
        issue('MAIL_TRANSPORT', 'log transport is not allowed in production');
      if (env.COOKIE_SECURE === false) issue('COOKIE_SECURE', 'cannot be false in production');
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  isTest: boolean;
  port: number;
  webUrl: string;
  allowedOrigins: string[];
  trustProxy: string | number | boolean;
  logLevel: Env['LOG_LEVEL'];
  rateLimitMultiplier: number;
  mongo: { uri: string; autoIndex: boolean };
  redisUrl: string | undefined;
  auth: {
    jwtSecret: string;
    refreshSecret: string;
    accessTtlSec: number;
    refreshTtlDays: number;
    cookieSecure: boolean;
  };
  mail: { transport: Env['MAIL_TRANSPORT']; smtpUrl: string | undefined; from: string };
  ai: {
    provider: Env['AI_PROVIDER'];
    apiKey: string | undefined;
    baseUrl: string | undefined;
    model: string | undefined;
    fallbackModel: string | undefined;
    timeoutMs: number;
    maxOutputTokens: number;
    maxInputChars: number;
    dailyRequestLimit: number;
    anthropicServerFallback: boolean;
    pricing: PriceTable;
  };
  embeddings: {
    provider: Env['AI_EMBEDDING_PROVIDER'];
    model: string | undefined;
    apiKey: string | undefined;
    baseUrl: string | undefined;
  };
  vectorStore: { provider: Env['VECTOR_STORE_PROVIDER']; atlasIndexName: string };
  storage: {
    driver: Env['OBJECT_STORAGE_DRIVER'];
    localDir: string;
    endpoint: string | undefined;
    region: string;
    bucket: string | undefined;
    accessKey: string | undefined;
    secretKey: string | undefined;
  };
  uploads: { maxBytes: number };
  knowledge: { minScore: number | undefined; chunkWords: number; chunkOverlapWords: number };
  contentDir: string | undefined;
}

export class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

function parseTrustProxy(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // `KEY=` in a .env file means "not set" — let defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const env = result.data;
  const isProduction = env.NODE_ENV === 'production';
  const webOrigin = new URL(env.WEB_URL).origin;
  // Reuse the chat provider's key/base URL for embeddings only when both use the same provider,
  // so a key is never sent to a different vendor.
  const sameEmbeddingVendor = env.AI_EMBEDDING_PROVIDER === env.AI_PROVIDER;

  return {
    env: env.NODE_ENV,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    webUrl: webOrigin,
    allowedOrigins: [...new Set([webOrigin, ...env.CORS_ORIGINS.map((o) => new URL(o).origin)])],
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    logLevel: env.LOG_LEVEL,
    rateLimitMultiplier: env.RATE_LIMIT_MULTIPLIER,
    mongo: { uri: env.MONGODB_URI, autoIndex: env.MONGODB_AUTO_INDEX ?? !isProduction },
    redisUrl: env.REDIS_URL,
    auth: {
      jwtSecret: env.JWT_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlSec: env.ACCESS_TOKEN_TTL_SEC,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      cookieSecure: env.COOKIE_SECURE ?? isProduction,
    },
    mail: { transport: env.MAIL_TRANSPORT, smtpUrl: env.SMTP_URL, from: env.MAIL_FROM },
    ai: {
      provider: env.AI_PROVIDER,
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      model: env.AI_MODEL,
      fallbackModel: env.AI_FALLBACK_MODEL,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      maxInputChars: env.AI_MAX_INPUT_CHARS,
      dailyRequestLimit: env.AI_DAILY_REQUEST_LIMIT,
      anthropicServerFallback: env.AI_ANTHROPIC_SERVER_FALLBACK,
      pricing: env.AI_PRICING_JSON ? priceTableSchema.parse(JSON.parse(env.AI_PRICING_JSON)) : {},
    },
    embeddings: {
      provider: env.AI_EMBEDDING_PROVIDER,
      model: env.AI_EMBEDDING_MODEL,
      apiKey: env.AI_EMBEDDING_API_KEY ?? (sameEmbeddingVendor ? env.AI_API_KEY : undefined),
      baseUrl: env.AI_EMBEDDING_BASE_URL ?? (sameEmbeddingVendor ? env.AI_BASE_URL : undefined),
    },
    vectorStore: {
      provider: env.VECTOR_STORE_PROVIDER,
      atlasIndexName: env.ATLAS_VECTOR_INDEX_NAME,
    },
    storage: {
      driver: env.OBJECT_STORAGE_DRIVER,
      localDir: env.OBJECT_STORAGE_LOCAL_DIR,
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      region: env.OBJECT_STORAGE_REGION,
      bucket: env.OBJECT_STORAGE_BUCKET,
      accessKey: env.OBJECT_STORAGE_ACCESS_KEY,
      secretKey: env.OBJECT_STORAGE_SECRET_KEY,
    },
    uploads: { maxBytes: env.UPLOAD_MAX_BYTES },
    knowledge: {
      minScore: env.KB_MIN_SCORE,
      chunkWords: env.KB_CHUNK_WORDS,
      chunkOverlapWords: env.KB_CHUNK_OVERLAP_WORDS,
    },
    contentDir: env.CONTENT_DIR,
  };
}
