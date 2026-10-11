import { chunkText } from '@genpath/ai-core';
import { AiProviderError } from '@genpath/ai-core/llm';
import type { KnowledgeFileType } from '@genpath/shared';
import { Types } from 'mongoose';
import type { AppContext } from '../../context';
import { KnowledgeChunkModel, KnowledgeDocumentModel } from '../../db/models/knowledge.model';
import type { IngestJob } from '../../lib/jobs';
import { ExtractionError, extractText } from './extract';

/** Hard cap so one document cannot flood the vector store. */
export const MAX_CHUNKS_PER_DOCUMENT = 3000;
const INSERT_BATCH = 500;

class IngestError extends Error {}

/**
 * Turns an uploaded document into retrievable chunks. Safe to run more than once: every run is
 * tied to the document's `indexVersion`, writes its chunks inactive, and only activates them if
 * that version is still current. Superseded or deleted documents leave nothing behind.
 */
export class IngestionService {
  constructor(private readonly ctx: AppContext) {}

  async process(job: IngestJob): Promise<void> {
    const { logger, storage, embeddings, config } = this.ctx;
    const documentId = new Types.ObjectId(job.documentId);
    const current = { _id: documentId, indexVersion: job.indexVersion };

    const doc = await KnowledgeDocumentModel.findOneAndUpdate(
      current,
      { $set: { status: 'processing', error: null } },
      { returnDocument: 'after' },
    ).lean();
    if (!doc) {
      logger.info({ job }, 'ingest job skipped: document deleted or superseded');
      return;
    }

    const started = Date.now();
    try {
      const text = await extractText(
        doc.fileType as KnowledgeFileType,
        await storage.get(doc.storageKey),
      );
      const chunks = chunkText(text, {
        maxWords: config.knowledge.chunkWords,
        overlapWords: config.knowledge.chunkOverlapWords,
      });
      if (chunks.length === 0) throw new ExtractionError('The document contains no text.');
      if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
        throw new ExtractionError(
          `The document is too long (more than ${MAX_CHUNKS_PER_DOCUMENT} passages).`,
        );
      }

      // Embed with the heading path so a passage keeps the context of the section it came from.
      const inputs = chunks.map((c) =>
        c.headingPath.length ? `${c.headingPath.join(' › ')}\n${c.text}` : c.text,
      );
      const embedded = await embeddings.embed(inputs);
      if (embedded.vectors.length !== chunks.length)
        throw new IngestError('Embedding count mismatch');

      // Clear leftovers from an earlier failed attempt at this same version, then write inactive chunks.
      await KnowledgeChunkModel.deleteMany({ documentId, indexVersion: job.indexVersion });
      const rows = chunks.map((c, i) => ({
        orgId: doc.orgId,
        documentId,
        indexVersion: job.indexVersion,
        active: false,
        visibility: doc.visibility,
        ordinal: c.index,
        text: c.text,
        headingPath: c.headingPath,
        start: c.start,
        end: c.end,
        embedding: embedded.vectors[i]!,
        embeddingModel: embedded.model,
      }));
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await KnowledgeChunkModel.insertMany(rows.slice(i, i + INSERT_BATCH), { ordered: false });
      }

      const committed = await KnowledgeDocumentModel.findOneAndUpdate(
        current,
        {
          $set: {
            status: 'ready',
            chunkCount: rows.length,
            embeddingModel: embedded.model,
            dimensions: embedded.dimensions,
            processedAt: new Date(),
            error: null,
          },
        },
        { returnDocument: 'after' },
      ).lean();
      if (!committed) {
        await KnowledgeChunkModel.deleteMany({ documentId, indexVersion: job.indexVersion });
        logger.info({ job }, 'ingest result discarded: document deleted or re-indexed meanwhile');
        return;
      }
      // Switch versions: activate the new chunks, then remove every other version.
      await KnowledgeChunkModel.updateMany(
        { documentId, indexVersion: job.indexVersion },
        { $set: { active: true } },
      );
      await KnowledgeChunkModel.deleteMany({ documentId, indexVersion: { $ne: job.indexVersion } });
      // A delete that raced with this job may have run before our insert: clean up orphans.
      if (!(await KnowledgeDocumentModel.exists({ _id: documentId }))) {
        await KnowledgeChunkModel.deleteMany({ documentId });
      }
      logger.info(
        {
          documentId: job.documentId,
          chunks: rows.length,
          model: embedded.model,
          ms: Date.now() - started,
        },
        'document indexed',
      );
    } catch (err) {
      const message =
        err instanceof ExtractionError
          ? err.message
          : err instanceof AiProviderError
            ? 'The embedding provider failed. Check the configuration and re-index the document.'
            : 'Processing failed unexpectedly. Re-index the document or contact an administrator.';
      if (!(err instanceof ExtractionError)) logger.error({ err, job }, 'ingest job failed');
      await KnowledgeChunkModel.deleteMany({ documentId, indexVersion: job.indexVersion });
      await KnowledgeDocumentModel.updateOne(current, {
        $set: { status: 'failed', error: message },
      });
    }
  }
}
