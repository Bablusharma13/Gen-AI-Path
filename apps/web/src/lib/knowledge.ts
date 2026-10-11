'use client';

import type {
  AskKnowledgeInput,
  DocumentVisibility,
  KnowledgeAnswerDto,
  KnowledgeDocumentDto,
  MemberDto,
  OrganizationDto,
  OrgRole,
  RetrievalDiagnosticDto,
} from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const kbKeys = {
  orgs: ['orgs'] as const,
  documents: (orgId: string) => ['org-documents', orgId] as const,
  members: (orgId: string) => ['org-members', orgId] as const,
};

const base = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

export const useOrganizations = () =>
  useQuery({ queryKey: kbKeys.orgs, queryFn: () => api<OrganizationDto[]>('/orgs') });

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<OrganizationDto>('/orgs', { method: 'POST', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: kbKeys.orgs }),
  });
}

/** Polls while any document is still being processed. */
export const useDocuments = (orgId: string) =>
  useQuery({
    queryKey: kbKeys.documents(orgId),
    queryFn: () => api<KnowledgeDocumentDto[]>(`${base(orgId)}/documents`),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === 'queued' || d.status === 'processing')
        ? 2000
        : false,
  });

function useInvalidateDocuments(orgId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: kbKeys.documents(orgId) }),
      qc.invalidateQueries({ queryKey: kbKeys.orgs }),
    ]);
}

export function useUploadDocument(orgId: string) {
  const invalidate = useInvalidateDocuments(orgId);
  return useMutation({
    mutationFn: ({
      file,
      title,
      visibility,
    }: {
      file: File;
      title?: string;
      visibility: DocumentVisibility;
    }) => {
      const form = new FormData();
      if (title) form.set('title', title);
      form.set('visibility', visibility);
      form.set('file', file);
      return api<KnowledgeDocumentDto>(`${base(orgId)}/documents`, {
        method: 'POST',
        formData: form,
      });
    },
    onSuccess: invalidate,
  });
}

export function useDocumentActions(orgId: string) {
  const invalidate = useInvalidateDocuments(orgId);
  const remove = useMutation({
    mutationFn: (documentId: string) =>
      api<void>(`${base(orgId)}/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const reindex = useMutation({
    mutationFn: (documentId: string) =>
      api<{ status: string }>(`${base(orgId)}/documents/${documentId}/reindex`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const visibility = useMutation({
    mutationFn: ({
      documentId,
      visibility,
    }: {
      documentId: string;
      visibility: DocumentVisibility;
    }) =>
      api<void>(`${base(orgId)}/documents/${documentId}`, {
        method: 'PATCH',
        body: { visibility },
      }),
    onSuccess: invalidate,
  });
  return { remove, reindex, visibility };
}

export const useAskKnowledge = (orgId: string) =>
  useMutation({
    mutationFn: (input: AskKnowledgeInput) =>
      api<KnowledgeAnswerDto>(`${base(orgId)}/ask`, { method: 'POST', body: input }),
  });

export const useDiagnostics = (orgId: string) =>
  useMutation({
    mutationFn: (q: string) =>
      api<{ minScore: number; results: RetrievalDiagnosticDto[] }>(
        `${base(orgId)}/diagnostics?q=${encodeURIComponent(q)}&topK=10`,
      ),
  });

export const useMembers = (orgId: string, enabled: boolean) =>
  useQuery({
    queryKey: kbKeys.members(orgId),
    queryFn: () => api<MemberDto[]>(`${base(orgId)}/members`),
    enabled,
  });

export function useMemberActions(orgId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: kbKeys.members(orgId) }),
      qc.invalidateQueries({ queryKey: kbKeys.orgs }),
    ]);
  const add = useMutation({
    mutationFn: (input: { email: string; role: OrgRole }) =>
      api<MemberDto>(`${base(orgId)}/members`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      api<void>(`${base(orgId)}/members/${userId}`, { method: 'PATCH', body: { role } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      api<void>(`${base(orgId)}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  return { add, update, remove };
}
