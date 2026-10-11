import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from './logger';

export const INGEST_QUEUE = 'knowledge-ingest';

export interface IngestJob {
  documentId: string;
  indexVersion: number;
}

export type IngestHandler = (job: IngestJob) => Promise<void>;

/** BullMQ needs its own connection with `maxRetriesPerRequest: null` (blocking commands). */
export function bullConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

/** Background work. The API only enqueues; processing happens in a worker (or inline in development). */
export interface JobQueue {
  readonly driver: 'inline' | 'bullmq';
  enqueueIngest(job: IngestJob): Promise<void>;
  close(): Promise<void>;
}

/**
 * Development/test queue: runs jobs one at a time in this process, after the request returns.
 * Work is lost if the process stops — production uses BullMQ (refused without Redis by config).
 */
export class InlineJobQueue implements JobQueue {
  readonly driver = 'inline' as const;
  private handler: IngestHandler | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly logger: Logger) {}

  setHandler(handler: IngestHandler): void {
    this.handler = handler;
  }

  async enqueueIngest(job: IngestJob): Promise<void> {
    const handler = this.handler;
    if (!handler) throw new Error('Inline job queue has no ingest handler');
    this.tail = this.tail
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => handler(job))
      .catch((err: unknown) => this.logger.error({ err, job }, 'inline ingest job failed'));
  }

  /** Resolves when every job enqueued so far has finished (used by tests and graceful shutdown). */
  async drain(): Promise<void> {
    let current: Promise<void>;
    do {
      current = this.tail;
      await current;
    } while (current !== this.tail);
  }

  async close(): Promise<void> {
    await this.drain();
  }
}

/** Redis-backed queue. A separate worker process (`src/worker.ts`) consumes the jobs. */
export class BullJobQueue implements JobQueue {
  readonly driver = 'bullmq' as const;
  private readonly queue: Queue<IngestJob>;
  private readonly connection: Redis;

  constructor(redisUrl: string) {
    this.connection = bullConnection(redisUrl);
    this.queue = new Queue<IngestJob>(INGEST_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async enqueueIngest(job: IngestJob): Promise<void> {
    // The job id makes re-enqueueing the same version a no-op.
    await this.queue.add('ingest', job, { jobId: `${job.documentId}-v${job.indexVersion}` });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export function createJobQueue(redisUrl: string | undefined, logger: Logger): JobQueue {
  return redisUrl ? new BullJobQueue(redisUrl) : new InlineJobQueue(logger);
}
