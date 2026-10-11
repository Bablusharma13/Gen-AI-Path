'use client';

import type {
  AssessmentDto,
  AssessmentListItemDto,
  AttemptInput,
  AttemptResultDto,
  CompleteLessonResultDto,
  CourseDetailDto,
  CourseSummaryDto,
  LessonDto,
  ProgressSummaryDto,
  RoadmapDto,
  SearchResultDto,
} from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { profileKey } from './auth';

export const keys = {
  courses: ['courses'] as const,
  course: (slug: string) => ['course', slug] as const,
  lesson: (courseSlug: string, lessonSlug: string) => ['lesson', courseSlug, lessonSlug] as const,
  roadmap: ['roadmap'] as const,
  summary: ['progress-summary'] as const,
  assessments: ['assessments'] as const,
  assessment: (id: string) => ['assessment', id] as const,
  attempts: (id: string) => ['assessment-attempts', id] as const,
  search: (q: string) => ['search', q] as const,
  bookmarks: ['bookmarks'] as const,
};

export const useCourses = () =>
  useQuery({ queryKey: keys.courses, queryFn: () => api<CourseSummaryDto[]>('/courses') });

export const useCourse = (slug: string) =>
  useQuery({
    queryKey: keys.course(slug),
    queryFn: () => api<CourseDetailDto>(`/courses/${encodeURIComponent(slug)}`),
  });

export const useLesson = (courseSlug: string, lessonSlug: string) =>
  useQuery({
    queryKey: keys.lesson(courseSlug, lessonSlug),
    queryFn: () =>
      api<LessonDto>(
        `/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lessonSlug)}`,
      ),
  });

export const useRoadmap = () =>
  useQuery({ queryKey: keys.roadmap, queryFn: () => api<RoadmapDto>('/roadmap') });

export const useProgressSummary = () =>
  useQuery({ queryKey: keys.summary, queryFn: () => api<ProgressSummaryDto>('/progress/summary') });

export const useAssessments = () =>
  useQuery({
    queryKey: keys.assessments,
    queryFn: () => api<AssessmentListItemDto[]>('/assessments'),
  });

export const useAssessment = (id: string) =>
  useQuery({
    queryKey: keys.assessment(id),
    queryFn: () => api<AssessmentDto>(`/assessments/${encodeURIComponent(id)}`),
  });

export const useAttemptHistory = (id: string) =>
  useQuery({
    queryKey: keys.attempts(id),
    queryFn: () =>
      api<
        {
          id: string;
          percent: number;
          passed: boolean;
          createdAt: string;
          durationSec: number | null;
        }[]
      >(`/assessments/${encodeURIComponent(id)}/attempts`),
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: () => api<SearchResultDto>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });

export const useBookmarks = () =>
  useQuery({
    queryKey: keys.bookmarks,
    queryFn: () =>
      api<
        {
          id: string;
          slug: string;
          courseSlug: string;
          title: LessonDto['title'];
          summary: LessonDto['summary'];
        }[]
      >('/bookmarks'),
  });

/** Invalidates everything that depends on learning progress. */
function useInvalidateProgress() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.courses }),
      qc.invalidateQueries({ queryKey: ['course'] }),
      qc.invalidateQueries({ queryKey: keys.roadmap }),
      qc.invalidateQueries({ queryKey: keys.summary }),
      qc.invalidateQueries({ queryKey: profileKey }),
      qc.invalidateQueries({ queryKey: keys.assessments }),
    ]);
}

export function useCompleteLesson(lessonId: string) {
  const invalidate = useInvalidateProgress();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CompleteLessonResultDto>(`/lessons/${lessonId}/complete`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['lesson'] });
      await invalidate();
    },
  });
}

export function useStartLesson() {
  return useMutation({
    mutationFn: (lessonId: string) =>
      api<{ status: string }>(`/lessons/${lessonId}/start`, { method: 'POST' }),
  });
}

export function useSaveNotes(lessonId: string) {
  return useMutation({
    mutationFn: (notes: string) =>
      api<{ notes: string }>(`/lessons/${lessonId}/notes`, { method: 'PUT', body: { notes } }),
  });
}

export function useBookmark(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookmarked: boolean) =>
      api<{ bookmarked: boolean }>(`/lessons/${lessonId}/bookmark`, {
        method: 'PUT',
        body: { bookmarked },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bookmarks }),
  });
}

export function useSubmitAttempt(assessmentId: string) {
  const invalidate = useInvalidateProgress();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AttemptInput) =>
      api<AttemptResultDto>(`/assessments/${encodeURIComponent(assessmentId)}/attempts`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.assessment(assessmentId) }),
        qc.invalidateQueries({ queryKey: keys.attempts(assessmentId) }),
        qc.invalidateQueries({ queryKey: ['lesson'] }),
        invalidate(),
      ]);
    },
  });
}

export function useUpdateRoadmapItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, ...input }: { courseId: string; known?: boolean; pinned?: boolean }) =>
      api<RoadmapDto>(`/roadmap/items/${courseId}`, { method: 'PATCH', body: input }),
    onSuccess: async (roadmap) => {
      qc.setQueryData(keys.roadmap, roadmap);
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.summary }),
        qc.invalidateQueries({ queryKey: profileKey }),
      ]);
    },
  });
}

export function useResetRoadmap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keepKnown: boolean) =>
      api<RoadmapDto>('/roadmap/reset', { method: 'POST', body: { keepKnown } }),
    onSuccess: (roadmap) => qc.setQueryData(keys.roadmap, roadmap),
  });
}
