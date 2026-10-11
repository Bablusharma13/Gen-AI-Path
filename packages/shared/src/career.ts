import { z } from 'zod';
import {
  contentIdSchema,
  localizedListSchema,
  localizedTextSchema,
  type LocalizedList,
  type LocalizedText,
} from './common';
import { contentStatusSchema } from './content';
import {
  skillLevelSchema,
  trackSchema,
  type CareerGoal,
  type SkillLevel,
  type Track,
} from './enums';

export const INTERVIEW_CATEGORIES = [
  'python',
  'ml-basics',
  'llm-fundamentals',
  'prompting',
  'rag',
  'agents',
  'evaluation',
  'system-design',
  'production',
  'behavioral',
] as const;
export const interviewCategorySchema = z.enum(INTERVIEW_CATEGORIES);
export type InterviewCategory = z.infer<typeof interviewCategorySchema>;

export const INTERVIEW_CATEGORY_LABELS: Record<InterviewCategory, string> = {
  python: 'Python',
  'ml-basics': 'ML basics',
  'llm-fundamentals': 'LLM fundamentals',
  prompting: 'Prompting & structured output',
  rag: 'RAG',
  agents: 'Agents & tool calling',
  evaluation: 'Evaluation',
  'system-design': 'System design',
  production: 'Production & security',
  behavioral: 'Behavioural',
};

export const interviewQuestionSchema = z.object({
  id: contentIdSchema,
  version: z.number().int().positive(),
  status: contentStatusSchema,
  category: interviewCategorySchema,
  level: skillLevelSchema,
  /** Tracks where this question commonly comes up. */
  tracks: z.array(trackSchema).min(1),
  question: localizedTextSchema,
  /** What a strong answer must cover — used for self-review, not automatic grading. */
  keyPoints: localizedListSchema,
  sampleAnswer: localizedTextSchema,
  followUps: localizedListSchema.optional(),
  relatedLessonIds: z.array(contentIdSchema).default([]),
});
export type InterviewQuestionContent = z.infer<typeof interviewQuestionSchema>;

export const interviewBankSchema = z.object({
  questions: z.array(interviewQuestionSchema).min(1).max(500),
});

export const PRACTICE_STATUSES = ['needs_practice', 'confident'] as const;
export const practiceStatusSchema = z.enum(PRACTICE_STATUSES);
export type PracticeStatus = z.infer<typeof practiceStatusSchema>;

export const interviewPracticeSchema = z.object({
  status: practiceStatusSchema.nullable(),
  notes: z.string().max(4000).optional(),
});
export type InterviewPracticeInput = z.infer<typeof interviewPracticeSchema>;

export const interviewQuerySchema = z.object({
  category: interviewCategorySchema.optional(),
  level: skillLevelSchema.optional(),
  status: z.enum(['needs_practice', 'confident', 'unreviewed']).optional(),
});

export interface InterviewQuestionDto {
  id: string;
  category: InterviewCategory;
  level: SkillLevel;
  tracks: Track[];
  question: LocalizedText;
  keyPoints: LocalizedList;
  sampleAnswer: LocalizedText;
  followUps: LocalizedList | null;
  relatedLessons: { id: string; slug: string; courseSlug: string; title: LocalizedText }[];
  practice: { status: PracticeStatus | null; notes: string; updatedAt: string | null };
}

export interface ReadinessItemDto {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
}

export interface CareerOverviewDto {
  careerGoal: CareerGoal | null;
  track: Track | null;
  /** Transparent checklist built from real progress. Never a hiring prediction. */
  readiness: ReadinessItemDto[];
  counts: {
    requiredCourses: number;
    completedRequiredCourses: number;
    assessmentsPassed: number;
    assessmentsTotal: number;
    projectsSubmitted: number;
    projectsReviewed: number;
    questionsConfident: number;
    questionsTotal: number;
  };
  byCategory: {
    category: InterviewCategory;
    total: number;
    confident: number;
    needsPractice: number;
  }[];
}
