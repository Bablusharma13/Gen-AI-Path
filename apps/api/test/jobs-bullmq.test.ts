import { Worker } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import { BullJobQueue, bullConnection, INGEST_QUEUE, type IngestJob } from '../src/lib/jobs';

const redisUrl = process.env.TEST_REDIS_URL;

/** Runs only when TEST_REDIS_URL points at a Redis server (CI provides one). */
describe.skipIf(!redisUrl)('BullMQ job queue', () => {
  const closers: (() => Promise<void>)[] = [];
  afterAll(async () => {
    for (const close of closers) await close();
  });

  it('delivers an ingest job to a worker exactly once per document version', async () => {
    const queue = new BullJobQueue(redisUrl!);
    closers.push(() => queue.close());
    const received: IngestJob[] = [];
    const connection = bullConnection(redisUrl!);
    const done = new Promise<void>((resolve) => {
      const worker = new Worker<IngestJob>(
        INGEST_QUEUE,
        async (job) => {
          received.push(job.data);
          resolve();
        },
        { connection },
      );
      closers.unshift(async () => {
        await worker.close();
        await connection.quit();
      });
    });
    const job = { documentId: `test-${Date.now()}`, indexVersion: 1 };
    await queue.enqueueIngest(job);
    await queue.enqueueIngest(job); // same job id: ignored
    await done;
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toEqual([job]);
  });
});
