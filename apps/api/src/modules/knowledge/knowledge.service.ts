import { createHash, randomBytes } from 'node:crypto';
import { assembleContext, keywordOverlap, validateCitations } from '@genpath/ai-core';
import { AiProviderError, buildRagPrompt, RAG_ANSWER, RAG_NOT_FOUND } from '@genpath/ai-core/llm';
import {
  KNOWLEDGE_FILE_TYPES,
  type AskKnowledgeInput,
  type DocumentStatus,
  type DocumentVisibility,
  type ExplanationLanguage,
  type KnowledgeAnswerDto,
  type KnowledgeCitationDto,
  type KnowledgeDocumentDto,
  type KnowledgeFileType,
  type MemberDto,
  type OrganizationDto,
  type OrgRole,
  type RetrievalDiagnosticDto,
  type RetrievalInfoDto,
  type Role,
} from '@genpath/shared';
import { Types } from 'mongoose';
import type { AppContext } from '../../context';
import {
  KnowledgeChunkModel,
  KnowledgeDocumentModel,
  MembershipModel,
  OrganizationModel,
  type KnowledgeDocumentDoc,
} from '../../db/models/knowledge.model';
import { ProfileModel } from '../../db/models/profile.model';
import { UserModel } from '../../db/models/user.model';
import { AppError, forbidden, notFound } from '../../lib/errors';
import type { MentorService } from '../ai/mentor.service';
import { toAppError } from '../ai/mentor.service';
import { detectFileType, ExtractionError, safeFilename } from './extract';
import { createVectorStore, type VectorHit, type VectorStore } from './vector-store';

const oid = (id: string) => new Types.ObjectId(id);
const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/** Weight of keyword overlap in the hybrid score (the rest is cosine similarity). */
export const KEYWORD_WEIGHT = 0.3;
/**
 * Default relevance thresholds when KB_MIN_SCORE is not set. The lexical value was chosen from the
 * labelled questions in test/knowledge.test.ts (relevant ≥ 0.37, unrelated ≤ 0.16). The semantic
 * value is an uncalibrated starting point: score distributions differ per embedding model, so set
 * KB_MIN_SCORE from your own labelled questions (retrieval diagnostics show the scores).
 */
export const DEFAULT_MIN_SCORE = { semantic: 0.35, lexical: 0.25 } as const;
const CONTEXT_TOKEN_BUDGET = 3000;
const MAX_ANSWER_TOKENS = 900;
export const MAX_DOCUMENTS_PER_ORG = 500;
/** Platform roles allowed to create organisations. */
export const ORG_CREATOR_ROLES: Role[] = ['instructor', 'org_admin', 'platform_admin'];

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ScoredHit extends VectorHit {
  keywordScore: number;
  score: number;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
}

function toDocumentDto(d: KnowledgeDocumentDoc, uploaderName: string): KnowledgeDocumentDto {
  return {
    id: d._id.toString(),
    title: d.title,
    filename: d.filename,
    fileType: d.fileType as KnowledgeFileType,
    sizeBytes: d.sizeBytes,
    visibility: d.visibility as DocumentVisibility,
    status: d.status as DocumentStatus,
    error: d.error ?? null,
    chunkCount: d.chunkCount,
    embeddingModel: d.embeddingModel ?? null,
    uploadedBy: uploaderName,
    createdAt: (d as unknown as { createdAt: Date }).createdAt.toISOString(),
    processedAt: d.processedAt?.toISOString() ?? null,
  };
}

export class KnowledgeService {
  private readonly vectorStore: VectorStore;

  constructor(
    private readonly ctx: AppContext,
    private readonly mentor: MentorService,
  ) {
    this.vectorStore = createVectorStore(
      ctx.config.vectorStore.provider,
      ctx.config.vectorStore.atlasIndexName,
      ctx.logger,
    );
  }

  get minScore(): number {
    return (
      this.ctx.config.knowledge.minScore ??
      (this.ctx.embeddings.semantic ? DEFAULT_MIN_SCORE.semantic : DEFAULT_MIN_SCORE.lexical)
    );
  }

  // ── Membership and authorisation ────────────────────────────────────────────

  /** Non-members get 404 so organisation ids cannot be probed. */
  async requireMember(userId: string, orgId: string): Promise<OrgRole> {
    if (!Types.ObjectId.isValid(orgId)) throw notFound('Organization');
    const membership = await MembershipModel.findOne(
      { orgId: oid(orgId), userId: oid(userId) },
      { role: 1 },
    ).lean();
    if (!membership) throw notFound('Organization');
    return membership.role as OrgRole;
  }

  async requireOrgAdmin(userId: string, orgId: string): Promise<void> {
    const role = await this.requireMember(userId, orgId);
    if (role !== 'admin') throw forbidden('Only organization admins can do that');
  }

  private visibilitiesFor(role: OrgRole): DocumentVisibility[] {
    return role === 'admin' ? ['members', 'admins'] : ['members'];
  }

  // ── Organisations and members ───────────────────────────────────────────────

  async createOrganization(userId: string, name: string): Promise<OrganizationDto> {
    const org = await OrganizationModel.create({
      name,
      slug: slugify(name),
      createdBy: oid(userId),
    });
    await MembershipModel.create({ orgId: org._id, userId: oid(userId), role: 'admin' });
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      role: 'admin',
      memberCount: 1,
      documentCount: 0,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async listOrganizations(userId: string): Promise<OrganizationDto[]> {
    const memberships = await MembershipModel.find(
      { userId: oid(userId) },
      { orgId: 1, role: 1 },
    ).lean();
    if (memberships.length === 0) return [];
    const orgIds = memberships.map((m) => m.orgId);
    const [orgs, memberCounts, docCounts] = await Promise.all([
      OrganizationModel.find({ _id: { $in: orgIds } })
        .sort({ name: 1 })
        .lean(),
      MembershipModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { orgId: { $in: orgIds } } },
        { $group: { _id: '$orgId', n: { $sum: 1 } } },
      ]),
      KnowledgeDocumentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { orgId: { $in: orgIds } } },
        { $group: { _id: '$orgId', n: { $sum: 1 } } },
      ]),
    ]);
    const roleOf = new Map(memberships.map((m) => [m.orgId.toString(), m.role as OrgRole]));
    const members = new Map(memberCounts.map((r) => [r._id.toString(), r.n]));
    const docs = new Map(docCounts.map((r) => [r._id.toString(), r.n]));
    return orgs.map((o) => ({
      id: o._id.toString(),
      name: o.name,
      slug: o.slug,
      role: roleOf.get(o._id.toString()) ?? 'member',
      memberCount: members.get(o._id.toString()) ?? 0,
      documentCount: docs.get(o._id.toString()) ?? 0,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async listMembers(userId: string, orgId: string): Promise<MemberDto[]> {
    await this.requireOrgAdmin(userId, orgId);
    const memberships = await MembershipModel.find({ orgId: oid(orgId) })
      .sort({ createdAt: 1 })
      .lean();
    const users = await UserModel.find(
      { _id: { $in: memberships.map((m) => m.userId) } },
      { name: 1, email: 1 },
    ).lean();
    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    return memberships.flatMap((m) => {
      const u = byId.get(m.userId.toString());
      return u
        ? [
            {
              userId: u._id.toString(),
              name: u.name,
              email: u.email,
              role: m.role as OrgRole,
              joinedAt: m.createdAt.toISOString(),
            },
          ]
        : [];
    });
  }

  /** Adds an existing GenPath account. There are no email invitations for unknown addresses yet. */
  async addMember(userId: string, orgId: string, email: string, role: OrgRole): Promise<MemberDto> {
    await this.requireOrgAdmin(userId, orgId);
    const user = await UserModel.findOne({ email }, { name: 1, email: 1, status: 1 }).lean();
    if (!user || user.status !== 'active') {
      throw new AppError(
        'NOT_FOUND',
        'No active GenPath account uses that email. Ask them to register first.',
      );
    }
    try {
      const m = await MembershipModel.create({ orgId: oid(orgId), userId: user._id, role });
      return {
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        role,
        joinedAt: m.createdAt.toISOString(),
      };
    } catch (err) {
      if (isDuplicateKey(err)) throw new AppError('CONFLICT', 'That person is already a member');
      throw err;
    }
  }

  private async assertNotLastAdmin(orgId: string, targetUserId: string): Promise<void> {
    const target = await MembershipModel.findOne(
      { orgId: oid(orgId), userId: oid(targetUserId) },
      { role: 1 },
    ).lean();
    if (!target) throw notFound('Member');
    if (
      target.role === 'admin' &&
      (await MembershipModel.countDocuments({ orgId: oid(orgId), role: 'admin' })) <= 1
    ) {
      throw new AppError('CONFLICT', 'An organization needs at least one admin');
    }
  }

  async updateMember(
    userId: string,
    orgId: string,
    targetUserId: string,
    role: OrgRole,
  ): Promise<void> {
    await this.requireOrgAdmin(userId, orgId);
    if (!Types.ObjectId.isValid(targetUserId)) throw notFound('Member');
    if (role !== 'admin') await this.assertNotLastAdmin(orgId, targetUserId);
    const res = await MembershipModel.updateOne(
      { orgId: oid(orgId), userId: oid(targetUserId) },
      { $set: { role } },
    );
    if (res.matchedCount === 0) throw notFound('Member');
  }

  async removeMember(userId: string, orgId: string, targetUserId: string): Promise<void> {
    await this.requireOrgAdmin(userId, orgId);
    if (!Types.ObjectId.isValid(targetUserId)) throw notFound('Member');
    await this.assertNotLastAdmin(orgId, targetUserId);
    await MembershipModel.deleteOne({ orgId: oid(orgId), userId: oid(targetUserId) });
  }

  // ── Documents ───────────────────────────────────────────────────────────────

  async listDocuments(userId: string, orgId: string): Promise<KnowledgeDocumentDto[]> {
    const role = await this.requireMember(userId, orgId);
    const docs = await KnowledgeDocumentModel.find({
      orgId: oid(orgId),
      visibility: { $in: this.visibilitiesFor(role) },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_DOCUMENTS_PER_ORG)
      .lean();
    const uploaders = await UserModel.find(
      { _id: { $in: docs.map((d) => d.uploadedBy) } },
      { name: 1 },
    ).lean();
    const nameOf = new Map(uploaders.map((u) => [u._id.toString(), u.name]));
    return docs.map((d) => toDocumentDto(d, nameOf.get(d.uploadedBy.toString()) ?? 'Unknown'));
  }

  private async ownedDocument(orgId: string, documentId: string): Promise<KnowledgeDocumentDoc> {
    if (!Types.ObjectId.isValid(documentId)) throw notFound('Document');
    const doc = await KnowledgeDocumentModel.findOne({
      _id: oid(documentId),
      orgId: oid(orgId),
    }).lean();
    if (!doc) throw notFound('Document');
    return doc;
  }

  async upload(
    userId: string,
    orgId: string,
    file: UploadedFile,
    meta: { title?: string | undefined; visibility: DocumentVisibility },
  ): Promise<KnowledgeDocumentDto> {
    await this.requireOrgAdmin(userId, orgId);
    let fileType: KnowledgeFileType;
    try {
      fileType = detectFileType(file.originalname, file.mimetype, file.buffer);
    } catch (err) {
      if (err instanceof ExtractionError) throw new AppError('UNSUPPORTED_MEDIA_TYPE', err.message);
      throw err;
    }
    if (
      (await KnowledgeDocumentModel.countDocuments({ orgId: oid(orgId) })) >= MAX_DOCUMENTS_PER_ORG
    ) {
      throw new AppError(
        'CONFLICT',
        `An organization can have at most ${MAX_DOCUMENTS_PER_ORG} documents`,
      );
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await KnowledgeDocumentModel.findOne(
      { orgId: oid(orgId), sha256 },
      { title: 1 },
    ).lean();
    if (duplicate)
      throw new AppError(
        'CONFLICT',
        `This file is already in the knowledge base as “${duplicate.title}”`,
      );

    const filename = safeFilename(file.originalname);
    const documentId = new Types.ObjectId();
    // Server-generated key: user input never becomes part of a storage path.
    const storageKey = `orgs/${orgId}/${documentId.toString()}/original.${fileType}`;
    await this.ctx.storage.put(storageKey, file.buffer, KNOWLEDGE_FILE_TYPES[fileType].mime);

    const title = meta.title ?? (filename.replace(/\.[^.]+$/, '').slice(0, 160) || 'Untitled');
    const doc = await KnowledgeDocumentModel.create({
      _id: documentId,
      orgId: oid(orgId),
      title,
      filename,
      fileType,
      sizeBytes: file.size,
      sha256,
      storageKey,
      visibility: meta.visibility,
      status: 'queued',
      uploadedBy: oid(userId),
    });
    await this.ctx.jobs.enqueueIngest({
      documentId: documentId.toString(),
      indexVersion: doc.indexVersion,
    });
    const uploader = await UserModel.findById(userId, { name: 1 }).lean();
    return toDocumentDto(doc.toObject() as KnowledgeDocumentDoc, uploader?.name ?? 'Unknown');
  }

  async reindex(
    userId: string,
    orgId: string,
    documentId: string,
  ): Promise<{ status: DocumentStatus }> {
    await this.requireOrgAdmin(userId, orgId);
    await this.ownedDocument(orgId, documentId);
    const updated = await KnowledgeDocumentModel.findOneAndUpdate(
      { _id: oid(documentId), orgId: oid(orgId) },
      { $inc: { indexVersion: 1 }, $set: { status: 'queued', error: null } },
      { returnDocument: 'after' },
    ).lean();
    if (!updated) throw notFound('Document');
    await this.ctx.jobs.enqueueIngest({ documentId, indexVersion: updated.indexVersion });
    return { status: 'queued' };
  }

  async setVisibility(
    userId: string,
    orgId: string,
    documentId: string,
    visibility: DocumentVisibility,
  ): Promise<void> {
    await this.requireOrgAdmin(userId, orgId);
    await this.ownedDocument(orgId, documentId);
    // Chunks first: a document must never be more visible in retrieval than its record says.
    await KnowledgeChunkModel.updateMany(
      { documentId: oid(documentId), orgId: oid(orgId) },
      { $set: { visibility } },
    );
    await KnowledgeDocumentModel.updateOne(
      { _id: oid(documentId), orgId: oid(orgId) },
      { $set: { visibility } },
    );
  }

  /** Removes the document everywhere: retrievable chunks first, then the stored original, then the record. */
  async deleteDocument(userId: string, orgId: string, documentId: string): Promise<void> {
    await this.requireOrgAdmin(userId, orgId);
    const doc = await this.ownedDocument(orgId, documentId);
    await KnowledgeChunkModel.deleteMany({ documentId: doc._id });
    await this.ctx.storage.delete(doc.storageKey);
    await KnowledgeDocumentModel.deleteOne({ _id: doc._id });
  }

  // ── Retrieval and grounded answers ─────────────────────────────────────────

  private async retrieve(
    orgId: string,
    role: OrgRole,
    question: string,
    limit: number,
    documentIds?: string[],
  ): Promise<{ hits: ScoredHit[]; embeddingModel: string }> {
    let embedded;
    try {
      embedded = await this.ctx.embeddings.embed([question]);
    } catch (err) {
      throw err instanceof AiProviderError ? toAppError(err) : err;
    }
    const candidates = await this.vectorStore.search({
      orgId: oid(orgId),
      visibilities: this.visibilitiesFor(role),
      documentIds: documentIds?.map(oid),
      embeddingModel: embedded.model,
      vector: embedded.vectors[0]!,
      limit: Math.max(limit * 4, 20),
    });
    const hits = candidates
      .map((c) => {
        const keywordScore = keywordOverlap(question, `${c.headingPath.join(' ')} ${c.text}`);
        return {
          ...c,
          keywordScore,
          score: (1 - KEYWORD_WEIGHT) * c.vectorScore + KEYWORD_WEIGHT * keywordScore,
        };
      })
      .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
      .slice(0, limit);
    return { hits, embeddingModel: embedded.model };
  }

  private async documentTitles(ids: string[]): Promise<Map<string, string>> {
    const docs = await KnowledgeDocumentModel.find(
      { _id: { $in: [...new Set(ids)].map(oid) } },
      { title: 1 },
    ).lean();
    return new Map(docs.map((d) => [d._id.toString(), d.title]));
  }

  async ask(userId: string, orgId: string, input: AskKnowledgeInput): Promise<KnowledgeAnswerDto> {
    const role = await this.requireMember(userId, orgId);
    const llm = this.ctx.llm;
    if (llm) await this.mentor.assertQuota(userId);

    const { hits, embeddingModel } = await this.retrieve(
      orgId,
      role,
      input.question,
      input.topK,
      input.documentIds,
    );
    const relevant = hits.filter((h) => h.score >= this.minScore);
    const retrieval: RetrievalInfoDto = {
      embeddingModel,
      semantic: this.ctx.embeddings.semantic,
      vectorStore: this.vectorStore.provider,
      candidates: hits.length,
      topScore: hits[0] ? Number(hits[0].score.toFixed(4)) : null,
      minScore: this.minScore,
    };
    const base = {
      droppedCitations: [],
      isMock: llm?.isMock ?? false,
      model: null,
      promptVersion: RAG_ANSWER.version,
      retrieval,
      truncated: false,
    };

    // Not-found path: nothing relevant enough, so the model is never asked to improvise.
    if (relevant.length === 0) {
      return { ...base, answer: null, found: false, reason: 'not_found', citations: [] };
    }

    const titles = await this.documentTitles(relevant.map((h) => h.documentId));
    const titleFor = (h: ScoredHit) => {
      const doc = titles.get(h.documentId) ?? 'Document';
      return h.headingPath.length ? `${doc} › ${h.headingPath.join(' › ')}` : doc;
    };
    const { context, sources } = assembleContext(
      relevant.map((h) => ({ id: h.chunkId, title: titleFor(h), text: h.text })),
      CONTEXT_TOKEN_BUDGET,
    );
    const hitById = new Map(relevant.map((h) => [h.chunkId, h]));
    const citationFor = (n: number): KnowledgeCitationDto => {
      const source = sources[n - 1]!;
      const hit = hitById.get(source.id)!;
      return {
        n,
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        documentTitle: titles.get(hit.documentId) ?? 'Document',
        headingPath: hit.headingPath,
        excerpt: hit.text.length > 400 ? `${hit.text.slice(0, 400)}…` : hit.text,
        score: Number(hit.score.toFixed(4)),
      };
    };

    // Without a configured model, show the passages themselves — clearly not an AI answer.
    if (!llm) {
      return {
        ...base,
        answer: null,
        found: true,
        reason: 'ai_not_configured',
        citations: sources.map((s) => citationFor(s.n)),
      };
    }

    const profile = await ProfileModel.findOne({ userId: oid(userId) }, { preferences: 1 }).lean();
    const language = (profile?.preferences?.explanationLanguage ??
      'hinglish') as ExplanationLanguage;
    const prompt = buildRagPrompt({ question: input.question, context, language });
    const started = Date.now();
    let result;
    try {
      result = await llm.generate({
        ...prompt,
        maxOutputTokens: Math.min(MAX_ANSWER_TOKENS, this.ctx.config.ai.maxOutputTokens),
      });
    } catch (err) {
      const providerError =
        err instanceof AiProviderError
          ? err
          : new AiProviderError('UNAVAILABLE', 'Unexpected AI failure', { cause: err });
      await this.mentor.record(userId, 'rag', {
        prompt: RAG_ANSWER,
        latencyMs: Date.now() - started,
        status: 'error',
        errorCode: providerError.code,
      });
      throw toAppError(providerError);
    }
    const refused = result.stopReason === 'refusal' || result.stopReason === 'content_filter';
    await this.mentor.record(userId, 'rag', {
      prompt: RAG_ANSWER,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - started,
      status: refused ? 'refused' : result.stopReason === 'max_tokens' ? 'truncated' : 'ok',
      fallbackUsed: result.fallbackUsed,
    });
    const answered = {
      ...base,
      model: result.model,
      truncated: result.stopReason === 'max_tokens',
    };

    const text = result.text.trim();
    // When the answer is withheld, the retrieved passages are still returned (clearly not as an
    // answer) so the learner can read the sources directly.
    const passages = () => sources.map((s) => citationFor(s.n));
    if (refused)
      return { ...answered, answer: null, found: false, reason: 'refused', citations: passages() };
    if (text === RAG_NOT_FOUND || text.startsWith(RAG_NOT_FOUND)) {
      return {
        ...answered,
        answer: null,
        found: false,
        reason: 'model_not_found',
        citations: passages(),
      };
    }
    // Citations are checked in code: numbers that do not match a provided source are removed.
    const checked = validateCitations(text, sources.length);
    if (checked.valid.length === 0) {
      return {
        ...answered,
        answer: null,
        found: false,
        reason: 'uncited',
        citations: passages(),
        droppedCitations: checked.invalid,
      };
    }
    return {
      ...answered,
      answer: checked.answer,
      found: true,
      reason: 'answered',
      citations: checked.valid.map(citationFor),
      droppedCitations: checked.invalid,
    };
  }

  /** Admin view of raw retrieval: every candidate with its scores, including those below the threshold. */
  async diagnostics(
    userId: string,
    orgId: string,
    q: string,
    topK: number,
  ): Promise<{ minScore: number; results: RetrievalDiagnosticDto[] }> {
    await this.requireOrgAdmin(userId, orgId);
    const { hits } = await this.retrieve(orgId, 'admin', q, topK);
    const titles = await this.documentTitles(hits.map((h) => h.documentId));
    return {
      minScore: this.minScore,
      results: hits.map((h) => ({
        chunkId: h.chunkId,
        documentId: h.documentId,
        documentTitle: titles.get(h.documentId) ?? 'Document',
        visibility: h.visibility,
        headingPath: h.headingPath,
        excerpt: h.text.length > 300 ? `${h.text.slice(0, 300)}…` : h.text,
        score: Number(h.score.toFixed(4)),
        vectorScore: Number(h.vectorScore.toFixed(4)),
        keywordScore: Number(h.keywordScore.toFixed(4)),
        passesThreshold: h.score >= this.minScore,
      })),
    };
  }
}
