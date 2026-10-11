import { z } from 'zod';

/** Platform-level roles. Organization membership roles are separate (see ORG_ROLES). */
export const ROLES = ['student', 'instructor', 'org_admin', 'platform_admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ORG_ROLES = ['member', 'instructor', 'admin'] as const;
export const orgRoleSchema = z.enum(ORG_ROLES);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const CAREER_GOALS = [
  'genai_app_engineer',
  'ai_agent_engineer',
  'ml_llm_engineer',
  'ai_platform_engineer',
  'research_foundations',
  'general',
] as const;
export const careerGoalSchema = z.enum(CAREER_GOALS);
export type CareerGoal = z.infer<typeof careerGoalSchema>;

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const skillLevelSchema = z.enum(SKILL_LEVELS);
export type SkillLevel = z.infer<typeof skillLevelSchema>;

export const EXPERIENCE_LEVELS = [
  'none',
  'basic_programming',
  'web_development',
  'python_development',
  'ml_ai',
] as const;
export const experienceSchema = z.enum(EXPERIENCE_LEVELS);
export type Experience = z.infer<typeof experienceSchema>;

/** Programming language used for code examples and exercises. */
export const PROGRAMMING_LANGUAGES = ['python', 'javascript', 'typescript'] as const;
export const programmingLanguageSchema = z.enum(PROGRAMMING_LANGUAGES);
export type ProgrammingLanguage = z.infer<typeof programmingLanguageSchema>;

/**
 * Language used for explanations. Independent from ProgrammingLanguage —
 * changing one must never change the other.
 */
export const EXPLANATION_LANGUAGES = ['hinglish', 'en', 'hi'] as const;
export const explanationLanguageSchema = z.enum(EXPLANATION_LANGUAGES);
export type ExplanationLanguage = z.infer<typeof explanationLanguageSchema>;

export const LEARNING_STYLES = [
  'beginner_friendly',
  'short_simple',
  'detailed',
  'interview_focused',
  'code_first',
  'deep_technical',
  'visual',
] as const;
export const learningStyleSchema = z.enum(LEARNING_STYLES);
export type LearningStyle = z.infer<typeof learningStyleSchema>;

export const DAILY_MINUTES = [15, 30, 60, 120] as const;
export const dailyMinutesSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(120),
]);
export type DailyMinutes = z.infer<typeof dailyMinutesSchema>;

export const THEMES = ['system', 'light', 'dark'] as const;
export const themeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof themeSchema>;

/** Career tracks A–E (see docs/CURRICULUM.md). */
export const TRACKS = ['A', 'B', 'C', 'D', 'E'] as const;
export const trackSchema = z.enum(TRACKS);
export type Track = z.infer<typeof trackSchema>;

export const CAREER_GOAL_TRACK: Record<CareerGoal, Track | null> = {
  genai_app_engineer: 'A',
  ai_agent_engineer: 'B',
  ml_llm_engineer: 'C',
  ai_platform_engineer: 'D',
  research_foundations: 'E',
  general: null,
};
