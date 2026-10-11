import { z } from 'zod';
import { paginationQuerySchema } from './common';
import { roleSchema, type Role } from './enums';

export const USER_STATUSES = ['active', 'suspended'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const adminUpdateUserSchema = z
  .object({ role: roleSchema.optional(), status: userStatusSchema.optional() })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'Provide a role or a status');

export const auditQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
});

export interface AdminOverviewDto {
  users: {
    total: number;
    byRole: Record<Role, number>;
    suspended: number;
    newLast7Days: number;
    activeLast7Days: number;
  };
  learning: {
    lessonsCompletedLast7Days: number;
    assessmentsSubmittedLast7Days: number;
    projectSubmissionsPending: number;
  };
  ai: {
    provider: string;
    model: string | null;
    isMock: boolean;
    requestsToday: number;
    requestsLast30Days: number;
    errorsLast30Days: number;
    /** Null when no request in the period had a known price. */
    costLast30DaysUsd: number | null;
    /** Requests in the period whose cost could not be estimated (unknown model price). */
    unpricedRequestsLast30Days: number;
  };
  knowledge: { organizations: number; documents: number; chunks: number; failedDocuments: number };
  generatedAt: string;
}

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AiUsageDayDto {
  day: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface AiUsageReportDto {
  days: AiUsageDayDto[];
  byFeature: {
    feature: string;
    requests: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
  }[];
  byModel: {
    model: string;
    provider: string;
    requests: number;
    isMock: boolean;
    costUsd: number | null;
  }[];
  /** Usage numbers the provider did not report and were estimated (≈ 4 characters per token). */
  estimatedRequests: number;
}

export interface AuditLogDto {
  id: string;
  action: string;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface PromptCatalogueEntryDto {
  id: string;
  version: number;
  description: string;
}
