import { Worker } from 'bullmq';
import { buildContext, shutdownContext } from './bootstrap';
import { bullConnection, INGEST_QUEUE, type IngestJob } from './lib/jobs';
import { IngestionService } from './modules/knowledge/ingestion.service';

/**
 * Background worker: consumes knowledge-base ingestion jobs from Redis (BullMQ).
 * Without REDIS_URL the API runs jobs in-process instead, and this worker has nothing to do.
 */
async function main(): Promise<void> {
  const ctx = await buildContext();
  if (!ctx.config.redisUrl || !ctx.redis) {
    ctx.logger.error(
      'REDIS_URL is not set: the API processes jobs in-process, so no worker is needed',
    );
    await shutdownContext(ctx);
    process.exit(1);
  }
  const ingestion = new IngestionService(ctx);
  const connection = bullConnection(ctx.config.redisUrl);
  const worker = new Worker<IngestJob>(INGEST_QUEUE, (job) => ingestion.process(job.data), {
    connection,
    concurrency: 2,
  });
  worker.on('failed', (job, err) => ctx.logger.error({ err, jobId: job?.id }, 'ingest job failed'));
  worker.on('completed', (job) => ctx.logger.info({ jobId: job.id }, 'ingest job completed'));
  ctx.logger.info({ queue: INGEST_QUEUE }, 'GenPath worker started');

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    ctx.logger.info({ signal }, 'Worker shutting down');
    const forceExit = setTimeout(() => process.exit(1), 30_000);
    forceExit.unref();
    void worker
      .close()
      .then(() => connection.quit())
      .then(() => shutdownContext(ctx))
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
