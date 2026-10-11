import {
  addMemberSchema,
  askKnowledgeSchema,
  createOrganizationSchema,
  diagnosticsQuerySchema,
  documentVisibilitySchema,
  objectIdSchema,
  updateMemberSchema,
  uploadMetadataSchema,
} from '@genpath/shared';
import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import { authOf, requireAuth, requireRole } from '../../middleware/auth';
import type { LimiterFactory } from '../../middleware/rate-limit';
import { AppError } from '../../lib/errors';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import type { Services } from '../../services';
import { ORG_CREATOR_ROLES } from './knowledge.service';

const orgParams = z.object({ orgId: objectIdSchema });
const memberParams = z.object({ orgId: objectIdSchema, userId: objectIdSchema });
const documentParams = z.object({ orgId: objectIdSchema, documentId: objectIdSchema });

export function knowledgeRouter(
  services: Services,
  limiter: LimiterFactory,
  multiplier: number,
  maxBytes: number,
): Router {
  const router = Router();
  router.use(requireAuth);
  const { knowledge, audit } = services;

  const uploadLimit = limiter({
    name: 'kb-upload',
    windowMs: 60 * 60_000,
    limit: 30 * multiplier,
    perUser: true,
  });
  const askLimit = limiter({
    name: 'kb-ask',
    windowMs: 60_000,
    limit: 10 * multiplier,
    perUser: true,
  });

  // Memory storage: files are validated (type + magic bytes) before anything is persisted.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, fieldSize: 1024, parts: 7 },
  }).single('file');
  const receiveFile: RequestHandler = (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              'PAYLOAD_TOO_LARGE',
              `Files can be at most ${Math.round(maxBytes / 1024 / 1024)} MB`,
            ),
          );
        }
        return next(new AppError('BAD_REQUEST', 'Upload exactly one file in the "file" field'));
      }
      next(err);
    });
  };

  router.get('/', async (req, res) => {
    res.json({ data: await knowledge.listOrganizations(authOf(req).userId) });
  });

  router.post('/', requireRole(...ORG_CREATOR_ROLES), async (req, res) => {
    const { name } = parseBody(createOrganizationSchema, req);
    const org = await knowledge.createOrganization(authOf(req).userId, name);
    await audit.record(req, {
      action: 'org.created',
      targetType: 'organization',
      targetId: org.id,
    });
    res.status(201).json({ data: org });
  });

  router.get('/:orgId/members', async (req, res) => {
    const { orgId } = parseParams(orgParams, req);
    res.json({ data: await knowledge.listMembers(authOf(req).userId, orgId) });
  });

  router.post('/:orgId/members', async (req, res) => {
    const { orgId } = parseParams(orgParams, req);
    const { email, role } = parseBody(addMemberSchema, req);
    const member = await knowledge.addMember(authOf(req).userId, orgId, email, role);
    await audit.record(req, {
      action: 'org.member_added',
      targetType: 'organization',
      targetId: orgId,
      metadata: { memberId: member.userId, role },
    });
    res.status(201).json({ data: member });
  });

  router.patch('/:orgId/members/:userId', async (req, res) => {
    const { orgId, userId } = parseParams(memberParams, req);
    const { role } = parseBody(updateMemberSchema, req);
    await knowledge.updateMember(authOf(req).userId, orgId, userId, role);
    await audit.record(req, {
      action: 'org.member_role_changed',
      targetType: 'organization',
      targetId: orgId,
      metadata: { memberId: userId, role },
    });
    res.status(204).end();
  });

  router.delete('/:orgId/members/:userId', async (req, res) => {
    const { orgId, userId } = parseParams(memberParams, req);
    await knowledge.removeMember(authOf(req).userId, orgId, userId);
    await audit.record(req, {
      action: 'org.member_removed',
      targetType: 'organization',
      targetId: orgId,
      metadata: { memberId: userId },
    });
    res.status(204).end();
  });

  router.get('/:orgId/documents', async (req, res) => {
    const { orgId } = parseParams(orgParams, req);
    res.json({ data: await knowledge.listDocuments(authOf(req).userId, orgId) });
  });

  router.post(
    '/:orgId/documents',
    uploadLimit,
    async (req, res, next) => {
      // Check membership before reading a potentially large body.
      const { orgId } = parseParams(orgParams, req);
      await knowledge.requireOrgAdmin(authOf(req).userId, orgId);
      next();
    },
    receiveFile,
    async (req, res) => {
      const { orgId } = parseParams(orgParams, req);
      if (!req.file) throw new AppError('BAD_REQUEST', 'Attach a file in the "file" field');
      const meta = parseBody(uploadMetadataSchema, req);
      const doc = await knowledge.upload(authOf(req).userId, orgId, req.file, meta);
      await audit.record(req, {
        action: 'knowledge.document_uploaded',
        targetType: 'knowledgeDocument',
        targetId: doc.id,
        metadata: {
          orgId,
          fileType: doc.fileType,
          sizeBytes: doc.sizeBytes,
          visibility: doc.visibility,
        },
      });
      res.status(201).json({ data: doc });
    },
  );

  router.post('/:orgId/documents/:documentId/reindex', async (req, res) => {
    const { orgId, documentId } = parseParams(documentParams, req);
    const result = await knowledge.reindex(authOf(req).userId, orgId, documentId);
    await audit.record(req, {
      action: 'knowledge.document_reindexed',
      targetType: 'knowledgeDocument',
      targetId: documentId,
    });
    res.json({ data: result });
  });

  router.patch('/:orgId/documents/:documentId', async (req, res) => {
    const { orgId, documentId } = parseParams(documentParams, req);
    const { visibility } = parseBody(z.object({ visibility: documentVisibilitySchema }), req);
    await knowledge.setVisibility(authOf(req).userId, orgId, documentId, visibility);
    await audit.record(req, {
      action: 'knowledge.document_visibility_changed',
      targetType: 'knowledgeDocument',
      targetId: documentId,
      metadata: { visibility },
    });
    res.status(204).end();
  });

  router.delete('/:orgId/documents/:documentId', async (req, res) => {
    const { orgId, documentId } = parseParams(documentParams, req);
    await knowledge.deleteDocument(authOf(req).userId, orgId, documentId);
    await audit.record(req, {
      action: 'knowledge.document_deleted',
      targetType: 'knowledgeDocument',
      targetId: documentId,
      metadata: { orgId },
    });
    res.status(204).end();
  });

  router.post('/:orgId/ask', askLimit, async (req, res) => {
    const { orgId } = parseParams(orgParams, req);
    const input = parseBody(askKnowledgeSchema, req);
    res.json({ data: await knowledge.ask(authOf(req).userId, orgId, input) });
  });

  router.get('/:orgId/diagnostics', async (req, res) => {
    const { orgId } = parseParams(orgParams, req);
    const { q, topK } = parseQuery(diagnosticsQuerySchema, req);
    res.json({ data: await knowledge.diagnostics(authOf(req).userId, orgId, q, topK) });
  });

  return router;
}
