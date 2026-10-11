import { z } from 'zod';
import { contentIdSchema } from './common';
import {
  careerGoalSchema,
  dailyMinutesSchema,
  experienceSchema,
  explanationLanguageSchema,
  learningStyleSchema,
  programmingLanguageSchema,
  skillLevelSchema,
  themeSchema,
  type CareerGoal,
  type DailyMinutes,
  type Experience,
  type ExplanationLanguage,
  type LearningStyle,
  type ProgrammingLanguage,
  type SkillLevel,
  type Theme,
} from './enums';

export const FONT_SCALES = [1, 1.125, 1.25] as const;
export const fontScaleSchema = z.union([z.literal(1), z.literal(1.125), z.literal(1.25)]);

const programmingLanguagesSchema = z
  .array(programmingLanguageSchema)
  .min(1, 'Pick at least one programming language')
  .max(3)
  .refine((list) => new Set(list).size === list.length, 'Duplicate languages');

export const onboardingSchema = z
  .object({
    careerGoal: careerGoalSchema,
    level: skillLevelSchema,
    experience: experienceSchema,
    programmingLanguages: programmingLanguagesSchema,
    primaryProgrammingLanguage: programmingLanguageSchema,
    explanationLanguage: explanationLanguageSchema,
    learningStyle: learningStyleSchema,
    dailyMinutes: dailyMinutesSchema,
    /** Courses the learner says they already know (placement / prerequisite bypass). */
    knownCourseIds: z.array(contentIdSchema).max(30).default([]),
  })
  .refine((v) => v.programmingLanguages.includes(v.primaryProgrammingLanguage), {
    path: ['primaryProgrammingLanguage'],
    message: 'Primary language must be one of your selected languages',
  });
export type OnboardingInput = z.input<typeof onboardingSchema>;

/**
 * Preference updates. Every field is optional and independent: changing the explanation language
 * never touches the programming language and vice versa.
 */
export const updatePreferencesSchema = z
  .object({
    explanationLanguage: explanationLanguageSchema,
    programmingLanguages: programmingLanguagesSchema,
    primaryProgrammingLanguage: programmingLanguageSchema,
    learningStyle: learningStyleSchema,
    dailyMinutes: dailyMinutesSchema,
    theme: themeSchema,
    reducedMotion: z.boolean(),
    fontScale: fontScaleSchema,
    mentorPersonalization: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    careerGoal: careerGoalSchema,
    level: skillLevelSchema,
    experience: experienceSchema,
    bio: z.string().trim().max(500),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface Preferences {
  explanationLanguage: ExplanationLanguage;
  programmingLanguages: ProgrammingLanguage[];
  primaryProgrammingLanguage: ProgrammingLanguage;
  learningStyle: LearningStyle;
  dailyMinutes: DailyMinutes;
  theme: Theme;
  reducedMotion: boolean;
  fontScale: (typeof FONT_SCALES)[number];
  mentorPersonalization: boolean;
}

export interface LearnerStats {
  xp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string | null;
}

export interface ProfileDto {
  userId: string;
  name: string;
  email: string;
  bio: string;
  careerGoal: CareerGoal | null;
  level: SkillLevel | null;
  experience: Experience | null;
  knownCourseIds: string[];
  preferences: Preferences;
  stats: LearnerStats;
  onboardingCompletedAt: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  explanationLanguage: 'hinglish',
  programmingLanguages: ['python'],
  primaryProgrammingLanguage: 'python',
  learningStyle: 'beginner_friendly',
  dailyMinutes: 30,
  theme: 'system',
  reducedMotion: false,
  fontScale: 1,
  mentorPersonalization: true,
};
