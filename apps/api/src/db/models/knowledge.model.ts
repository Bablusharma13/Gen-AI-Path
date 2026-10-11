import {
  DOCUMENT_STATUSES,
  DOCUMENT_VISIBILITIES,
  KNOWLEDGE_FILE_TYPES,
  ORG_ROLES,
} from '@genpath/shared';
import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

/** A tenant. Knowledge documents and their chunks always belong to exactly one organisation. */
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, maxlength: 100 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'organizations' },
);

const membershipSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ORG_ROLES, required: true },
  },
  { timestamps: true, collection: 'memberships' },
);
membershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1 });

const knowledgeDocumentSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    title: { type: String, required: true, maxlength: 160 },
    filename: { type: String, required: true, maxlength: 200 },
    fileType: { type: String, enum: Object.keys(KNOWLEDGE_FILE_TYPES), required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true },
    storageKey: { type: String, required: true },
    visibility: { type: String, enum: DOCUMENT_VISIBILITIES, default: 'members' },
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'queued' },
    /** Safe, user-facing failure reason (never a stack trace). */
    error: { type: String, default: null, maxlength: 300 },
    /** Incremented on every (re)index request; a job only commits if its version is still current. */
    indexVersion: { type: Number, default: 1 },
    chunkCount: { type: Number, default: 0 },
    embeddingModel: { type: String, default: null },
    dimensions: { type: Number, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'knowledgeDocuments' },
);
knowledgeDocumentSchema.index({ orgId: 1, createdAt: -1 });
knowledgeDocumentSchema.index({ orgId: 1, sha256: 1 });

/**
 * One retrievable passage. `orgId` and `visibility` are copied from the document so every
 * retrieval query can filter on them directly (including inside an Atlas `$vectorSearch` filter).
 */
const knowledgeChunkSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'KnowledgeDocument', required: true },
    indexVersion: { type: Number, required: true },
    /** False while a re-index is being written, so half-written versions are never retrieved. */
    active: { type: Boolean, default: false },
    visibility: { type: String, enum: DOCUMENT_VISIBILITIES, required: true },
    ordinal: { type: Number, required: true },
    text: { type: String, required: true },
    headingPath: { type: [String], default: [] },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    embedding: { type: [Number], required: true },
    embeddingModel: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'knowledgeChunks' },
);
knowledgeChunkSchema.index({ orgId: 1, active: 1, embeddingModel: 1, visibility: 1 });
knowledgeChunkSchema.index({ documentId: 1, indexVersion: 1 });

export type OrganizationDoc = InferSchemaType<typeof organizationSchema> & { _id: Types.ObjectId };
export type KnowledgeDocumentDoc = InferSchemaType<typeof knowledgeDocumentSchema> & {
  _id: Types.ObjectId;
};

export const OrganizationModel = model('Organization', organizationSchema);
export const MembershipModel = model('Membership', membershipSchema);
export const KnowledgeDocumentModel = model('KnowledgeDocument', knowledgeDocumentSchema);
export const KnowledgeChunkModel = model('KnowledgeChunk', knowledgeChunkSchema);
