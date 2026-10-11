'use client';

import type {
  ProjectDetailDto,
  ProjectSubmissionDto,
  ProjectSubmissionInput,
  ProjectSummaryDto,
  ReviewQueueItemDto,
} from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { profileKey } from './auth';
import { keys as curriculumKeys } from './curriculum';

export const projectKeys = {
  list: ['projects'] as const,
  detail: (id: string) => ['project', id] as const,
  reviewQueue: (status: string) => ['review-queue', status] as const,
};

export const useProjects = () =>
  useQuery({ queryKey: projectKeys.list, queryFn: () => api<ProjectSummaryDto[]>('/projects') });

export const useProject = (id: string) =>
  useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api<ProjectDetailDto>(`/projects/${encodeURIComponent(id)}`),
  });

function useInvalidateProject(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) }),
      qc.invalidateQueries({ queryKey: projectKeys.list }),
      qc.invalidateQueries({ queryKey: curriculumKeys.summary }),
      qc.invalidateQueries({ queryKey: profileKey }),
    ]);
}

export function useStartProject(id: string) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: () =>
      api<{ status: string }>(`/projects/${encodeURIComponent(id)}/start`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useToggleMilestone(id: string) {
  const invalidate = useInvalidateProject(id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, completed }: { milestoneId: string; completed: boolean }) =>
      api<{ completedMilestones: number; xpAwarded: number }>(
        `/projects/${encodeURIComponent(id)}/milestones/${encodeURIComponent(milestoneId)}`,
        { method: 'PUT', body: { completed } },
      ),
    // Tick the box immediately; roll back if the server rejects the change.
    onMutate: async ({ milestoneId, completed }) => {
      await qc.cancelQueries({ queryKey: projectKeys.detail(id) });
      const previous = qc.getQueryData<ProjectDetailDto>(projectKeys.detail(id));
      qc.setQueryData<ProjectDetailDto>(projectKeys.detail(id), (p) =>
        p
          ? {
              ...p,
              milestones: p.milestones.map((m) =>
                m.id === milestoneId
                  ? { ...m, completedAt: completed ? new Date().toISOString() : null }
                  : m,
              ),
            }
          : p,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(projectKeys.detail(id), context.previous);
    },
    onSettled: invalidate,
  });
}

export function useSubmitProject(id: string) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: (input: ProjectSubmissionInput) =>
      api<ProjectSubmissionDto>(`/projects/${encodeURIComponent(id)}/submissions`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

export const useReviewQueue = (status: 'submitted' | 'reviewed', enabled = true) =>
  useQuery({
    queryKey: projectKeys.reviewQueue(status),
    queryFn: () => api<ReviewQueueItemDto[]>(`/projects/review/submissions?status=${status}`),
    enabled,
  });

export function useReviewSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, feedback }: { submissionId: string; feedback: string }) =>
      api<ProjectSubmissionDto>(
        `/projects/review/submissions/${encodeURIComponent(submissionId)}`,
        {
          method: 'POST',
          body: { feedback },
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-queue'] }),
  });
}
