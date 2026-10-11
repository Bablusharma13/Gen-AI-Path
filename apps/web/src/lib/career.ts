'use client';

import type {
  CareerOverviewDto,
  InterviewCategory,
  InterviewPracticeInput,
  InterviewQuestionDto,
} from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const careerKeys = {
  overview: ['career-overview'] as const,
  questions: ['interview-questions'] as const,
};

export const useCareerOverview = () =>
  useQuery({
    queryKey: careerKeys.overview,
    queryFn: () => api<CareerOverviewDto>('/career/overview'),
  });

/** The bank is small (tens of questions), so it is fetched once and filtered on the client. */
export const useInterviewQuestions = () =>
  useQuery({
    queryKey: careerKeys.questions,
    queryFn: () => api<InterviewQuestionDto[]>('/career/questions'),
  });

export function useSetPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, ...input }: InterviewPracticeInput & { questionId: string }) =>
      api<InterviewQuestionDto['practice']>(
        `/career/questions/${encodeURIComponent(questionId)}/practice`,
        {
          method: 'PUT',
          body: input,
        },
      ),
    onSuccess: (practice, { questionId }) => {
      qc.setQueryData<InterviewQuestionDto[]>(careerKeys.questions, (prev) =>
        prev?.map((q) => (q.id === questionId ? { ...q, practice } : q)),
      );
      void qc.invalidateQueries({ queryKey: careerKeys.overview });
    },
  });
}

export type { InterviewCategory };
