'use client';

import type {
  AdminOverviewDto,
  AdminUserDto,
  AiUsageReportDto,
  AuditLogDto,
  PromptCatalogueEntryDto,
  Role,
  UserStatus,
} from '@genpath/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiPage } from './api';

export const adminKeys = {
  overview: ['admin-overview'] as const,
  users: (filters: object) => ['admin-users', filters] as const,
  usage: (days: number) => ['admin-usage', days] as const,
  audit: (action: string) => ['admin-audit', action] as const,
  prompts: ['admin-prompts'] as const,
};

export const useAdminOverview = () =>
  useQuery({
    queryKey: adminKeys.overview,
    queryFn: () => api<AdminOverviewDto>('/admin/overview'),
  });

export interface UserFilters {
  q: string;
  role: Role | '';
  status: UserStatus | '';
}

export function useAdminUsers(filters: UserFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.users(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '25' });
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.role) params.set('role', filters.role);
      if (filters.status) params.set('status', filters.status);
      if (pageParam) params.set('cursor', pageParam);
      return apiPage<AdminUserDto>(`/admin/users?${params.toString()}`);
    },
    getNextPageParam: (last) => last.page.nextCursor,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...change }: { userId: string; role?: Role; status?: UserStatus }) =>
      api<AdminUserDto>(`/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: change,
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-users'] }),
        qc.invalidateQueries({ queryKey: adminKeys.overview }),
        qc.invalidateQueries({ queryKey: ['admin-audit'] }),
      ]),
  });
}

export const useAiUsage = (days: number) =>
  useQuery({
    queryKey: adminKeys.usage(days),
    queryFn: () => api<AiUsageReportDto>(`/admin/ai-usage?days=${days}`),
  });

export function useAuditLogs(action: string) {
  return useInfiniteQuery({
    queryKey: adminKeys.audit(action),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (action) params.set('action', action);
      if (pageParam) params.set('cursor', pageParam);
      return apiPage<AuditLogDto>(`/admin/audit-logs?${params.toString()}`);
    },
    getNextPageParam: (last) => last.page.nextCursor,
  });
}

export const usePrompts = () =>
  useQuery({
    queryKey: adminKeys.prompts,
    queryFn: () => api<PromptCatalogueEntryDto[]>('/admin/prompts'),
  });
