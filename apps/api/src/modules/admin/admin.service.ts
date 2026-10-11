import { PROMPT_CATALOGUE } from '@genpath/ai-core/llm';
import {
  ROLES,
  type AdminOverviewDto,
  type AdminUserDto,
  type AiUsageReportDto,
  type AuditLogDto,
  type PromptCatalogueEntryDto,
  type Role,
  type UserStatus,
} from '@genpath/shared';
import { Types } from 'mongoose';
import type { AppContext } from '../../context';
import { AiInteractionModel } from '../../db/models/ai.model';
import { AuditLogModel } from '../../db/models/audit-log.model';
import {
  KnowledgeChunkModel,
  KnowledgeDocumentModel,
  OrganizationModel,
} from '../../db/models/knowledge.model';
import {
  AssessmentAttemptModel,
  LearningEventModel,
  LessonProgressModel,
} from '../../db/models/progress.model';
import { ProjectSubmissionModel } from '../../db/models/project.model';
import { UserModel } from '../../db/models/user.model';
import { AppError, notFound } from '../../lib/errors';
import type { AuthService } from '../auth/auth.service';
import { utcDay } from '../learning/learning.service';

const DAY_MS = 86_400_000;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export interface Page<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null };
}

function cursorFilter(cursor: string | undefined): Record<string, unknown> {
  if (!cursor) return {};
  if (!Types.ObjectId.isValid(cursor)) throw new AppError('BAD_REQUEST', 'Invalid cursor');
  return { _id: { $lt: new Types.ObjectId(cursor) } };
}

export class AdminService {
  constructor(
    private readonly ctx: AppContext,
    private readonly auth: AuthService,
  ) {}

  async overview(): Promise<AdminOverviewDto> {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS);
    const monthAgo = new Date(now - 30 * DAY_MS);
    const today = new Date(`${utcDay()}T00:00:00.000Z`);
    const [
      roles,
      total,
      suspended,
      newUsers,
      activeUsers,
      lessons,
      attempts,
      pending,
      aiToday,
      ai30,
      orgs,
      docs,
      chunks,
      failed,
    ] = await Promise.all([
      UserModel.aggregate<{ _id: Role; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      UserModel.countDocuments(),
      UserModel.countDocuments({ status: 'suspended' }),
      UserModel.countDocuments({ createdAt: { $gte: weekAgo } }),
      LearningEventModel.distinct('userId', { at: { $gte: weekAgo } }),
      LessonProgressModel.countDocuments({ completedAt: { $gte: weekAgo } }),
      AssessmentAttemptModel.countDocuments({ createdAt: { $gte: weekAgo } }),
      ProjectSubmissionModel.countDocuments({ status: 'submitted' }),
      AiInteractionModel.countDocuments({ createdAt: { $gte: today } }),
      AiInteractionModel.aggregate<{
        requests: number;
        errors: number;
        cost: number;
        priced: number;
        unpriced: number;
      }>([
        { $match: { createdAt: { $gte: monthAgo } } },
        {
          $group: {
            _id: null,
            requests: { $sum: 1 },
            errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
            cost: { $sum: { $ifNull: ['$costUsd', 0] } },
            priced: { $sum: { $cond: [{ $ne: ['$costUsd', null] }, 1, 0] } },
            unpriced: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$costUsd', null] }, { $ne: ['$isMock', true] }] }, 1, 0],
              },
            },
          },
        },
      ]),
      OrganizationModel.countDocuments(),
      KnowledgeDocumentModel.countDocuments(),
      KnowledgeChunkModel.countDocuments({ active: true }),
      KnowledgeDocumentModel.countDocuments({ status: 'failed' }),
    ]);
    const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
    for (const r of roles) byRole[r._id] = r.n;
    const usage = ai30[0];
    const llm = this.ctx.llm;
    return {
      users: {
        total,
        byRole,
        suspended,
        newLast7Days: newUsers,
        activeLast7Days: activeUsers.length,
      },
      learning: {
        lessonsCompletedLast7Days: lessons,
        assessmentsSubmittedLast7Days: attempts,
        projectSubmissionsPending: pending,
      },
      ai: {
        provider: llm?.providerId ?? 'none',
        model: llm?.model || null,
        isMock: llm?.isMock ?? false,
        requestsToday: aiToday,
        requestsLast30Days: usage?.requests ?? 0,
        errorsLast30Days: usage?.errors ?? 0,
        costLast30DaysUsd: usage && usage.priced > 0 ? round(usage.cost) : null,
        unpricedRequestsLast30Days: usage?.unpriced ?? 0,
      },
      knowledge: { organizations: orgs, documents: docs, chunks, failedDocuments: failed },
      generatedAt: new Date(now).toISOString(),
    };
  }

  async users(query: {
    limit: number;
    cursor?: string | undefined;
    q?: string | undefined;
    role?: Role | undefined;
    status?: UserStatus | undefined;
  }): Promise<Page<AdminUserDto>> {
    const filter: Record<string, unknown> = { ...cursorFilter(query.cursor) };
    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    if (query.q) {
      const re = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }
    const rows = await UserModel.find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role as Role,
        status: u.status as UserStatus,
        emailVerified: Boolean(u.emailVerifiedAt),
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      page: {
        limit: query.limit,
        nextCursor: rows.length > query.limit ? page.at(-1)!._id.toString() : null,
      },
    };
  }

  /**
   * Role and status changes apply on the target's next request (sessions are re-checked every
   * request). Suspension also revokes every session. Admins cannot change their own account; the
   * last-active-admin check is defence in depth (the acting admin always remains active).
   */
  async updateUser(
    actorId: string,
    userId: string,
    change: { role?: Role | undefined; status?: UserStatus | undefined },
  ): Promise<AdminUserDto> {
    if (!Types.ObjectId.isValid(userId)) throw notFound('User');
    if (actorId === userId)
      throw new AppError('FORBIDDEN', 'You cannot change your own role or status');
    const user = await UserModel.findById(userId).lean();
    if (!user) throw notFound('User');
    const losesAdmin =
      user.role === 'platform_admin' &&
      user.status === 'active' &&
      ((change.role && change.role !== 'platform_admin') || change.status === 'suspended');
    if (
      losesAdmin &&
      (await UserModel.countDocuments({ role: 'platform_admin', status: 'active' })) <= 1
    ) {
      throw new AppError('CONFLICT', 'There must be at least one active platform admin');
    }
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          ...(change.role ? { role: change.role } : {}),
          ...(change.status ? { status: change.status } : {}),
        },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!updated) throw notFound('User');
    if (change.status === 'suspended') await this.auth.revokeAllSessions(userId, 'suspended');
    return {
      id: updated._id.toString(),
      name: updated.name,
      email: updated.email,
      role: updated.role as Role,
      status: updated.status as UserStatus,
      emailVerified: Boolean(updated.emailVerifiedAt),
      createdAt: updated.createdAt.toISOString(),
      lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    };
  }

  async aiUsage(days = 30): Promise<AiUsageReportDto> {
    const since = new Date(new Date(`${utcDay()}T00:00:00.000Z`).getTime() - (days - 1) * DAY_MS);
    const match = { $match: { createdAt: { $gte: since } } };
    const sums = {
      requests: { $sum: 1 },
      errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
      inputTokens: { $sum: '$inputTokens' },
      outputTokens: { $sum: '$outputTokens' },
      cost: { $sum: { $ifNull: ['$costUsd', 0] } },
      priced: { $sum: { $cond: [{ $ne: ['$costUsd', null] }, 1, 0] } },
    };
    type Row = {
      _id: unknown;
      requests: number;
      errors: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      priced: number;
    };
    const [byDay, byFeature, byModel, estimated] = await Promise.all([
      AiInteractionModel.aggregate<Row>([
        match,
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, ...sums } },
      ]),
      AiInteractionModel.aggregate<Row>([
        match,
        { $group: { _id: '$feature', ...sums } },
        { $sort: { requests: -1 } },
      ]),
      AiInteractionModel.aggregate<
        Row & { _id: { model: string; provider: string; isMock: boolean } }
      >([
        match,
        { $group: { _id: { model: '$model', provider: '$provider', isMock: '$isMock' }, ...sums } },
        { $sort: { requests: -1 } },
      ]),
      AiInteractionModel.countDocuments({ createdAt: { $gte: since }, usageEstimated: true }),
    ]);
    const cost = (r: Row) => (r.priced > 0 ? round(r.cost) : null);
    const dayMap = new Map(byDay.map((r) => [r._id as string, r]));
    return {
      // Every day in the window, including days without requests, so charts have no gaps.
      days: Array.from({ length: days }, (_, i) => {
        const day = utcDay(new Date(since.getTime() + i * DAY_MS));
        const r = dayMap.get(day);
        return {
          day,
          requests: r?.requests ?? 0,
          errors: r?.errors ?? 0,
          inputTokens: r?.inputTokens ?? 0,
          outputTokens: r?.outputTokens ?? 0,
          costUsd: r ? cost(r) : null,
        };
      }),
      byFeature: byFeature.map((r) => ({
        feature: String(r._id),
        requests: r.requests,
        errors: r.errors,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: cost(r),
      })),
      byModel: byModel.map((r) => ({
        model: r._id.model,
        provider: r._id.provider,
        isMock: Boolean(r._id.isMock),
        requests: r.requests,
        costUsd: cost(r),
      })),
      estimatedRequests: estimated,
    };
  }

  async auditLogs(query: {
    limit: number;
    cursor?: string | undefined;
    action?: string | undefined;
  }): Promise<Page<AuditLogDto>> {
    const filter: Record<string, unknown> = { ...cursorFilter(query.cursor) };
    if (query.action) filter.action = query.action;
    const rows = await AuditLogModel.find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();
    const page = rows.slice(0, query.limit);
    const actors = await UserModel.find(
      { _id: { $in: page.flatMap((r) => (r.actorId ? [r.actorId] : [])) } },
      { name: 1 },
    ).lean();
    const nameOf = new Map(actors.map((a) => [a._id.toString(), a.name]));
    return {
      data: page.map((r) => ({
        id: r._id.toString(),
        action: r.action,
        actorName: r.actorId ? (nameOf.get(r.actorId.toString()) ?? 'Deleted user') : null,
        targetType: r.targetType ?? null,
        targetId: r.targetId ?? null,
        metadata: (r.metadata ?? {}) as AuditLogDto['metadata'],
        createdAt: r.createdAt.toISOString(),
      })),
      page: {
        limit: query.limit,
        nextCursor: rows.length > query.limit ? page.at(-1)!._id.toString() : null,
      },
    };
  }

  prompts(): PromptCatalogueEntryDto[] {
    return PROMPT_CATALOGUE.map((p) => ({
      id: p.id,
      version: p.version,
      description: p.description,
    }));
  }
}
