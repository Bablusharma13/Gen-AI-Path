import { cosine } from '@genpath/ai-core';
import type { DocumentVisibility } from '@genpath/shared';
import type { Types } from 'mongoose';
import { KnowledgeChunkModel } from '../../db/models/knowledge.model';
import type { Logger } from '../../lib/logger';

export interface VectorQuery {
  /** Tenant filter — always applied inside the query, never afterwards. */
  orgId: Types.ObjectId;
  visibilities: DocumentVisibility[];
  documentIds?: Types.ObjectId[] | undefined;
  embeddingModel: string;
  vector: number[];
  limit: number;
}

export interface VectorHit {
  chunkId: string;
  documentId: string;
  text: string;
  headingPath: string[];
  visibility: DocumentVisibility;
  /** Cosine similarity in [-1, 1]. */
  vectorScore: number;
}

export interface VectorStore {
  readonly provider: 'mongodb-local' | 'atlas';
  search(query: VectorQuery): Promise<VectorHit[]>;
}

/** Shared filter: tenant, active index version, same embedding model, visibility, optional document subset. */
export function chunkFilter(q: Omit<VectorQuery, 'vector' | 'limit'>): Record<string, unknown> {
  return {
    orgId: q.orgId,
    active: true,
    embeddingModel: q.embeddingModel,
    visibility: { $in: q.visibilities },
    ...(q.documentIds?.length ? { documentId: { $in: q.documentIds } } : {}),
  };
}

/** Upper bound on chunks scanned per query by the local store. Beyond this, use Atlas Vector Search. */
export const LOCAL_SCAN_LIMIT = 50_000;

/**
 * Exact cosine search computed in the API process over the organisation's chunks. Simple and
 * dependency-free; fine for development and small knowledge bases (cost grows linearly with chunks).
 */
export class MongoLocalVectorStore implements VectorStore {
  readonly provider = 'mongodb-local' as const;

  constructor(private readonly logger: Logger) {}

  async search(q: VectorQuery): Promise<VectorHit[]> {
    const cursor = KnowledgeChunkModel.find(chunkFilter(q), {
      documentId: 1,
      text: 1,
      headingPath: 1,
      visibility: 1,
      embedding: 1,
    })
      .limit(LOCAL_SCAN_LIMIT + 1)
      .lean()
      .cursor();
    const hits: VectorHit[] = [];
    let scanned = 0;
    for await (const chunk of cursor) {
      scanned += 1;
      if (scanned > LOCAL_SCAN_LIMIT) {
        this.logger.warn(
          { orgId: q.orgId.toString() },
          'local vector search hit the scan limit; consider VECTOR_STORE_PROVIDER=atlas',
        );
        break;
      }
      if (chunk.embedding.length !== q.vector.length) continue;
      hits.push({
        chunkId: chunk._id.toString(),
        documentId: chunk.documentId.toString(),
        text: chunk.text,
        headingPath: chunk.headingPath,
        visibility: chunk.visibility as DocumentVisibility,
        vectorScore: cosine(q.vector, chunk.embedding),
      });
    }
    return hits
      .sort((a, b) => b.vectorScore - a.vectorScore || a.chunkId.localeCompare(b.chunkId))
      .slice(0, q.limit);
  }
}

/**
 * MongoDB Atlas Vector Search. Requires a vector index on `knowledgeChunks.embedding` with
 * `orgId`, `active`, `embeddingModel`, `visibility` and `documentId` declared as filter fields
 * (see docs/AI_ARCHITECTURE.md). Not exercised by the automated tests, which run on a local mongod.
 */
export class AtlasVectorStore implements VectorStore {
  readonly provider = 'atlas' as const;

  constructor(private readonly indexName: string) {}

  async search(q: VectorQuery): Promise<VectorHit[]> {
    const rows = await KnowledgeChunkModel.aggregate<{
      _id: Types.ObjectId;
      documentId: Types.ObjectId;
      text: string;
      headingPath: string[];
      visibility: DocumentVisibility;
      score: number;
    }>([
      {
        $vectorSearch: {
          index: this.indexName,
          path: 'embedding',
          queryVector: q.vector,
          numCandidates: Math.min(q.limit * 20, 10_000),
          limit: q.limit,
          filter: chunkFilter(q),
        },
      },
      {
        $project: {
          documentId: 1,
          text: 1,
          headingPath: 1,
          visibility: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);
    return rows.map((r) => ({
      chunkId: r._id.toString(),
      documentId: r.documentId.toString(),
      text: r.text,
      headingPath: r.headingPath,
      visibility: r.visibility,
      // Atlas reports cosine similarity normalised to [0, 1] as (1 + cos) / 2.
      vectorScore: 2 * r.score - 1,
    }));
  }
}

export function createVectorStore(
  provider: 'mongodb-local' | 'atlas',
  atlasIndexName: string,
  logger: Logger,
): VectorStore {
  return provider === 'atlas'
    ? new AtlasVectorStore(atlasIndexName)
    : new MongoLocalVectorStore(logger);
}
