import { z } from 'zod';
import { emailSchema, objectIdSchema } from './common';
import { orgRoleSchema, type OrgRole } from './enums';

/** Documents an organisation can upload to its knowledge base. Checked by extension, MIME and magic bytes. */
export const KNOWLEDGE_FILE_TYPES = {
  txt: { mime: 'text/plain', label: 'Plain text' },
  md: { mime: 'text/markdown', label: 'Markdown' },
  pdf: { mime: 'application/pdf', label: 'PDF' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word (.docx)',
  },
} as const;
export type KnowledgeFileType = keyof typeof KNOWLEDGE_FILE_TYPES;

export const DOCUMENT_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Who inside the organisation may retrieve a document's chunks. */
export const DOCUMENT_VISIBILITIES = ['members', 'admins'] as const;
export const documentVisibilitySchema = z.enum(DOCUMENT_VISIBILITIES);
export type DocumentVisibility = z.infer<typeof documentVisibilitySchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const addMemberSchema = z.object({
  email: emailSchema,
  role: orgRoleSchema.default('member'),
});

export const updateMemberSchema = z.object({ role: orgRoleSchema });

export const uploadMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  visibility: documentVisibilitySchema.default('members'),
});

export const askKnowledgeSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  topK: z.coerce.number().int().min(1).max(8).default(5),
  documentIds: z.array(objectIdSchema).max(20).optional(),
});
export type AskKnowledgeInput = z.infer<typeof askKnowledgeSchema>;

export const diagnosticsQuerySchema = z.object({
  q: z.string().trim().min(3).max(500),
  topK: z.coerce.number().int().min(1).max(20).default(10),
});

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  /** The caller's role in this organisation. */
  role: OrgRole;
  memberCount: number;
  documentCount: number;
  createdAt: string;
}

export interface MemberDto {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
}

export interface KnowledgeDocumentDto {
  id: string;
  title: string;
  filename: string;
  fileType: KnowledgeFileType;
  sizeBytes: number;
  visibility: DocumentVisibility;
  status: DocumentStatus;
  /** Safe, user-facing reason when status is "failed". */
  error: string | null;
  chunkCount: number;
  embeddingModel: string | null;
  uploadedBy: string;
  createdAt: string;
  processedAt: string | null;
}

export interface KnowledgeCitationDto {
  /** Citation number used in the answer text, e.g. [1]. */
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  excerpt: string;
  score: number;
}

export interface RetrievalInfoDto {
  embeddingModel: string;
  /** False for the local lexical fallback (no semantic embedding model configured). */
  semantic: boolean;
  vectorStore: 'mongodb-local' | 'atlas';
  candidates: number;
  topScore: number | null;
  minScore: number;
}

export interface KnowledgeAnswerDto {
  /** Null when the answer was withheld (not found, uncited, or AI not configured). */
  answer: string | null;
  found: boolean;
  reason:
    'answered' | 'not_found' | 'uncited' | 'ai_not_configured' | 'model_not_found' | 'refused';
  /** True when the answer hit the output-token limit and may be cut off. */
  truncated: boolean;
  citations: KnowledgeCitationDto[];
  /** Citation numbers in the model output that did not match a retrieved source (removed). */
  droppedCitations: number[];
  isMock: boolean;
  model: string | null;
  promptVersion: number;
  retrieval: RetrievalInfoDto;
}

export interface RetrievalDiagnosticDto {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  visibility: DocumentVisibility;
  headingPath: string[];
  excerpt: string;
  score: number;
  vectorScore: number;
  keywordScore: number;
  passesThreshold: boolean;
}
