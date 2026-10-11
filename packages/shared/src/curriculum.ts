import { z } from 'zod';
import type { LocalizedList, LocalizedText } from './common';
import type { CodeExample, LabId, LessonSections } from './content';
import type { Track } from './enums';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';
export type CourseStatus = 'not_started' | 'in_progress' | 'completed';

export interface CourseProgressDto {
  completedLessons: number;
  totalLessons: number;
  status: CourseStatus;
  lastLessonId: string | null;
}

export interface CourseSummaryDto {
  id: string;
  slug: string;
  level: number;
  order: number;
  tracks: Track[];
  requiredForTracks: Track[];
  title: LocalizedText;
  summary: LocalizedText;
  estimatedHours: number;
  prerequisites: string[];
  moduleCount: number;
  lessonCount: number;
  progress: CourseProgressDto;
}

export interface LessonSummaryDto {
  id: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  estimatedMinutes: number;
  topics: string[];
  labId: LabId | null;
  exerciseCount: number;
  hasAssessment: boolean;
  status: LessonStatus;
  bookmarked: boolean;
}

export interface CourseDetailDto extends CourseSummaryDto {
  description: LocalizedText;
  outcomes: LocalizedList;
  modules: {
    id: string;
    title: LocalizedText;
    summary: LocalizedText;
    lessons: LessonSummaryDto[];
  }[];
  prerequisiteCourses: { id: string; slug: string; title: LocalizedText; satisfied: boolean }[];
}

export interface LessonRefDto {
  id: string;
  slug: string;
  courseSlug: string;
  title: LocalizedText;
}

export interface LessonDto {
  id: string;
  slug: string;
  version: number;
  courseId: string;
  courseSlug: string;
  courseTitle: LocalizedText;
  moduleId: string;
  moduleTitle: LocalizedText;
  title: LocalizedText;
  summary: LocalizedText;
  estimatedMinutes: number;
  objectives: LocalizedList;
  topics: string[];
  sections: LessonSections;
  codeExamples: CodeExample[];
  lab: { id: LabId; config: Record<string, unknown>; prompt?: LocalizedText | undefined } | null;
  exercises: { id: string; title: LocalizedText; passed: boolean; attempts: number }[];
  assessment: {
    id: string;
    title: LocalizedText;
    questionCount: number;
    bestPercent: number | null;
    passed: boolean;
  } | null;
  projects: { id: string; title: LocalizedText }[];
  related: LessonRefDto[];
  prerequisites: (LessonRefDto & { completed: boolean })[];
  navigation: { previous: LessonRefDto | null; next: LessonRefDto | null };
  progress: {
    status: LessonStatus;
    startedAt: string | null;
    completedAt: string | null;
    notes: string;
    bookmarked: boolean;
  };
}

export interface CompleteLessonResultDto {
  progress: LessonDto['progress'];
  xpAwarded: number;
  stats: { xp: number; currentStreak: number; longestStreak: number };
  courseCompleted: boolean;
  next: LessonRefDto | null;
}

export const notesSchema = z.object({ notes: z.string().max(10_000) });
export const bookmarkSchema = z.object({ bookmarked: z.boolean() });

export interface SearchResultDto {
  lessons: (LessonRefDto & { summary: LocalizedText; courseTitle: LocalizedText })[];
  courses: { id: string; slug: string; title: LocalizedText; summary: LocalizedText }[];
}

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });

export interface ProgressSummaryDto {
  continueLearning: (LessonRefDto & { courseTitle: LocalizedText; status: LessonStatus }) | null;
  recommendedLesson: (LessonRefDto & { courseTitle: LocalizedText; reason: string }) | null;
  completedLessons: number;
  totalLessons: number;
  coursesInProgress: { id: string; slug: string; title: LocalizedText; percent: number }[];
  stats: { xp: number; currentStreak: number; longestStreak: number; lastActiveDay: string | null };
  today: { minutesGoal: number; lessonsCompleted: number; activities: number };
  weakTopics: WeakTopicDto[];
  recentActivity: { type: string; title: string; at: string }[];
  weeklyActivity: { day: string; count: number }[];
}

export interface WeakTopicDto {
  topic: string;
  missed: number;
  answered: number;
  attempts: number;
  evidence: string;
  suggestedLessons: LessonRefDto[];
}
