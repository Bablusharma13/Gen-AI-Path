import { createEmbeddingProvider } from '@genpath/ai-core';
import { createLlmProvider, LlmService } from '@genpath/ai-core/llm';
import { loadConfig, type AppConfig } from './config/env';
import { loadEnvFile } from './config/load-env-file';
import type { AppContext } from './context';
import { connectMongo, disconnectMongo } from './db/connection';
import { createJobQueue } from './lib/jobs';
import { createLogger } from './lib/logger';
import { createMailer } from './lib/mailer';
import { createRedis } from './lib/redis';
import { createObjectStorage } from './lib/storage';

export const API_VERSION = '0.1.0';

/** Loads configuration and connects to infrastructure. Shared by the API and worker processes. */
export async function buildContext(): Promise<AppContext> {
  loadEnvFile();
  const config = loadConfig();
  const logger = createLogger(config);

  await connectMongo(config.mongo.uri, logger, { autoIndex: config.mongo.autoIndex });
  const redis = await createRedis(config.redisUrl, logger);
  if (!redis) {
    logger.warn(
      'REDIS_URL not set: using in-memory rate limits and in-process jobs (development mode only)',
    );
  }

  const mailer = createMailer(config, logger);
  if (mailer.transport === 'log') {
    logger.warn('MAIL_TRANSPORT=log: emails are written to this log instead of being sent');
  }

  const { llm, embeddings } = buildAi(config);
  logger.info(
    { provider: config.ai.provider, model: config.ai.model ?? null, embeddings: embeddings.id },
    llm
      ? 'AI provider configured'
      : 'AI provider not configured (AI_PROVIDER=none): mentor shows setup guidance',
  );

  const storage = createObjectStorage(config.storage);
  const jobs = createJobQueue(redis ? config.redisUrl : undefined, logger);
  logger.info(
    { storage: storage.driver, jobs: jobs.driver, vectorStore: config.vectorStore.provider },
    'Knowledge base configured',
  );

  return {
    config,
    logger,
    redis,
    mailer,
    llm,
    embeddings,
    storage,
    jobs,
    startedAt: Date.now(),
    version: API_VERSION,
  };
}

export function buildAi(config: AppConfig): Pick<AppContext, 'llm' | 'embeddings'> {
  const provider = createLlmProvider({
    provider: config.ai.provider,
    apiKey: config.ai.apiKey,
    baseUrl: config.ai.baseUrl,
    timeoutMs: config.ai.timeoutMs,
    anthropicServerFallback: config.ai.anthropicServerFallback,
  });
  const llm = provider
    ? new LlmService({
        provider,
        model: config.ai.model ?? (provider.isMock ? 'mock-model' : ''),
        fallbackModel: config.ai.fallbackModel,
        maxOutputTokens: config.ai.maxOutputTokens,
      })
    : null;
  const embeddings = createEmbeddingProvider({
    provider: config.embeddings.provider,
    model: config.embeddings.model,
    apiKey: config.embeddings.apiKey,
    baseUrl: config.embeddings.baseUrl,
    timeoutMs: config.ai.timeoutMs,
  });
  return { llm, embeddings };
}

export async function shutdownContext(ctx: AppContext): Promise<void> {
  await ctx.jobs.close().catch(() => undefined);
  await Promise.allSettled([disconnectMongo(), ctx.redis?.quit()]);
}
