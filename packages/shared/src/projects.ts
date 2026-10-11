import { z } from 'zod';
import {
  contentIdSchema,
  localizedListSchema,
  localizedTextSchema,
  type LocalizedList,
  type LocalizedText,
} from './common';
import { contentStatusSchema } from './content';
import { skillLevelSchema, trackSchema, type SkillLevel, type Track } from './enums';

export const projectMilestoneSchema = z.object({
  id: contentIdSchema,
  title: localizedTextSchema,
  description: localizedTextSchema,
  checklist: localizedListSchema,
});

export const projectRubricSchema = z.object({
  id: contentIdSchema,
  criterion: localizedTextSchema,
  points: z.number().int().min(1).max(100),
  /** What "excellent" looks like for this criterion. */
  excellent: localizedTextSchema,
});

export const projectContentSchema = z.object({
  id: contentIdSchema,
  version: z.number().int().positive(),
  status: contentStatusSchema,
  order: z.number().int().min(0),
  level: skillLevelSchema,
  estimatedHours: z.number().min(1).max(200),
  tracks: z.array(trackSchema).min(1),
  techStack: z.array(z.string().min(1).max(40)).default([]),
  /** Lessons that prepare a learner for this project. */
  lessonIds: z.array(contentIdSchema).default([]),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  problemStatement: localizedTextSchema,
  requirements: localizedListSchema,
  acceptanceCriteria: localizedListSchema,
  architecture: localizedTextSchema,
  dataModel: localizedTextSchema,
  apiDesign: localizedTextSchema.optional(),
  milestones: z.array(projectMilestoneSchema).min(2).max(12),
  testRequirements: localizedListSchema,
  securityChecklist: localizedListSchema,
  deployment: localizedTextSchema,
  readmeRequirements: localizedListSchema,
  rubric: z.array(projectRubricSchema).min(2).max(10),
});
export type ProjectContent = z.infer<typeof projectContentSchema>;

export type ProjectStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed';

export interface ProjectSummaryDto {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  level: SkillLevel;
  estimatedHours: number;
  tracks: Track[];
  techStack: string[];
  milestoneCount: number;
  completedMilestones: number;
  status: ProjectStatus;
}

export interface ProjectSubmissionDto {
  id: string;
  repoUrl: string;
  demoUrl: string | null;
  notes: string;
  checklist: { criterionId: string; selfAssessed: boolean }[];
  status: 'submitted' | 'reviewed';
  feedback: string | null;
  reviewerName: string | null;
  createdAt: string;
}

export interface ProjectDetailDto extends Omit<ProjectSummaryDto, 'completedMilestones'> {
  problemStatement: LocalizedText;
  requirements: LocalizedList;
  acceptanceCriteria: LocalizedList;
  architecture: LocalizedText;
  dataModel: LocalizedText;
  apiDesign: LocalizedText | null;
  milestones: (z.infer<typeof projectMilestoneSchema> & { completedAt: string | null })[];
  testRequirements: LocalizedList;
  securityChecklist: LocalizedList;
  deployment: LocalizedText;
  readmeRequirements: LocalizedList;
  rubric: z.infer<typeof projectRubricSchema>[];
  lessons: {
    id: string;
    slug: string;
    courseSlug: string;
    title: LocalizedText;
    completed: boolean;
  }[];
  submissions: ProjectSubmissionDto[];
}

const httpsUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .refine((u) => !/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(u), 'Use a public URL');

export const projectSubmissionSchema = z.object({
  repoUrl: httpsUrl,
  demoUrl: httpsUrl.optional(),
  notes: z.string().trim().max(4000).default(''),
  checklist: z
    .array(z.object({ criterionId: contentIdSchema, selfAssessed: z.boolean() }))
    .max(10)
    .default([]),
});
export type ProjectSubmissionInput = z.infer<typeof projectSubmissionSchema>;

export const milestoneToggleSchema = z.object({ completed: z.boolean() });

/** A submission waiting for (or after) instructor review. Learner data is limited to name. */
export interface ReviewQueueItemDto extends ProjectSubmissionDto {
  projectId: string;
  projectTitle: LocalizedText;
  learnerName: string;
  rubric: z.infer<typeof projectRubricSchema>[];
}

export const submissionReviewSchema = z.object({
  feedback: z.string().trim().min(10, 'Write at least a sentence of feedback').max(4000),
});
export type SubmissionReviewInput = z.infer<typeof submissionReviewSchema>;
