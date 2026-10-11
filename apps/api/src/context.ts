import type { EmbeddingProvider } from '@genpath/ai-core';
import type { LlmService } from '@genpath/ai-core/llm';
import type { Redis } from 'ioredis';
import type { AppConfig } from './config/env';
import type { JobQueue } from './lib/jobs';
import type { Logger } from './lib/logger';
import type { Mailer } from './lib/mailer';
import type { ObjectStorage } from './lib/storage';

/** Infrastructure shared by routes and services. Built once in bootstrap, injected in tests. */
export interface AppContext {
  config: AppConfig;
  logger: Logger;
  redis: Redis | null;
  mailer: Mailer;
  /** Null when AI_PROVIDER=none: AI features degrade gracefully. */
  llm: LlmService | null;
  embeddings: EmbeddingProvider;
  /** Uploaded knowledge-base originals. */
  storage: ObjectStorage;
  /** Background jobs (document ingestion). */
  jobs: JobQueue;
  startedAt: number;
  version: string;
}
