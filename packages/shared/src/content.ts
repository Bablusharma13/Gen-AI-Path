import { z } from 'zod';
import { contentIdSchema, localizedListSchema, localizedTextSchema } from './common';
import { experienceSchema, trackSchema } from './enums';

/**
 * Content schema for versioned curriculum files in `content/`. These files are the reviewed
 * source of truth; the seeder validates them with these schemas and loads them into MongoDB.
 */

export const CONTENT_STATUSES = ['draft', 'published'] as const;
export const contentStatusSchema = z.enum(CONTENT_STATUSES);

export const LAB_IDS = [
  'tokens',
  'embeddings',
  'attention',
  'rag-pipeline',
  'gradient-descent',
] as const;
export const labIdSchema = z.enum(LAB_IDS);
export type LabId = z.infer<typeof labIdSchema>;

const codeVariantsSchema = z
  .object({
    python: z.string().min(1).optional(),
    javascript: z.string().min(1).optional(),
    typescript: z.string().min(1).optional(),
  })
  .refine(
    (v) => Boolean(v.python ?? v.javascript ?? v.typescript),
    'Provide at least one code variant',
  );

export const codeExampleSchema = z.object({
  id: contentIdSchema,
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  variants: codeVariantsSchema,
  /** Illustrative output. Labelled as "expected output" in the UI, never as a live run. */
  expectedOutput: z.string().optional(),
});
export type CodeExample = z.infer<typeof codeExampleSchema>;

export const lessonLabSchema = z.object({
  id: labIdSchema,
  /** Lab-specific starting configuration (validated by the lab itself). */
  config: z.record(z.string(), z.unknown()).default({}),
  prompt: localizedTextSchema.optional(),
});

export const lessonSectionsSchema = z.object({
  explanation: localizedTextSchema,
  analogy: localizedTextSchema,
  visual: localizedTextSchema.optional(),
  guidedExercise: localizedTextSchema,
  challenge: localizedTextSchema,
  commonMistakes: localizedListSchema,
  projectApplication: localizedTextSchema,
  summary: localizedListSchema,
});
export type LessonSections = z.infer<typeof lessonSectionsSchema>;

export const lessonContentSchema = z.object({
  id: contentIdSchema,
  slug: contentIdSchema,
  version: z.number().int().positive(),
  status: contentStatusSchema,
  title: localizedTextSchema,
  summary: localizedTextSchema,
  estimatedMinutes: z.number().int().min(5).max(240),
  /** Lesson ids recommended before this one (advisory; learners can bypass). */
  prerequisites: z.array(contentIdSchema).default([]),
  objectives: localizedListSchema,
  /** Topic tags used for weak-topic detection and recommendations. */
  topics: z.array(contentIdSchema).min(1),
  sections: lessonSectionsSchema,
  codeExamples: z.array(codeExampleSchema).default([]),
  lab: lessonLabSchema.optional(),
  exerciseIds: z.array(contentIdSchema).default([]),
  assessmentId: contentIdSchema.optional(),
  projectIds: z.array(contentIdSchema).default([]),
  relatedLessonIds: z.array(contentIdSchema).default([]),
});
export type LessonContent = z.infer<typeof lessonContentSchema>;

export const courseModuleSchema = z.object({
  id: contentIdSchema,
  title: localizedTextSchema,
  summary: localizedTextSchema,
  lessonIds: z.array(contentIdSchema).min(1),
});

export const courseContentSchema = z.object({
  id: contentIdSchema,
  slug: contentIdSchema,
  version: z.number().int().positive(),
  status: contentStatusSchema,
  level: z.number().int().min(0).max(16),
  order: z.number().int().min(0),
  /** Tracks this course is relevant to, and the subset for which it is required. */
  tracks: z.array(trackSchema).min(1),
  requiredForTracks: z.array(trackSchema).default([]),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  description: localizedTextSchema,
  outcomes: localizedListSchema,
  estimatedHours: z.number().min(0.5).max(200),
  /** Course ids that should be completed (or marked known) first. */
  prerequisites: z.array(contentIdSchema).default([]),
  /** Experience levels that probably already cover this course (roadmap suggests skimming). */
  likelyKnownBy: z.array(experienceSchema).default([]),
  modules: z.array(courseModuleSchema).min(1),
});
export type CourseContent = z.infer<typeof courseContentSchema>;

const optionSchema = z.object({
  id: z.string().regex(/^[a-z]$/, 'Option ids are single letters a–f'),
  text: localizedTextSchema,
});

const questionBase = {
  id: contentIdSchema,
  prompt: localizedTextSchema,
  explanation: localizedTextSchema,
  topics: z.array(contentIdSchema).min(1),
  points: z.number().int().min(1).max(10).default(1),
};

export const rubricGroupSchema = z.object({
  id: contentIdSchema,
  /** The idea the answer must contain, shown as feedback when missing. */
  idea: localizedTextSchema,
  /** Accepted words/phrases (case-insensitive, any language). One match satisfies the group. */
  anyOf: z.array(z.string().min(2)).min(1),
});

export const questionContentSchema = z.discriminatedUnion('type', [
  z.object({
    ...questionBase,
    type: z.literal('single_choice'),
    options: z.array(optionSchema).min(2).max(6),
    correctOptionIds: z.array(z.string()).length(1),
  }),
  z.object({
    ...questionBase,
    type: z.literal('multiple_choice'),
    options: z.array(optionSchema).min(2).max(6),
    correctOptionIds: z.array(z.string()).min(1),
  }),
  z.object({
    ...questionBase,
    type: z.literal('short_text'),
    rubric: z.array(rubricGroupSchema).min(1).max(6),
    /** Number of rubric groups needed for full marks (default: all). */
    requiredGroups: z.number().int().min(1).optional(),
    sampleAnswer: localizedTextSchema,
  }),
]);
export type QuestionContent = z.infer<typeof questionContentSchema>;

export const assessmentContentSchema = z.object({
  id: contentIdSchema,
  version: z.number().int().positive(),
  status: contentStatusSchema,
  courseId: contentIdSchema,
  lessonId: contentIdSchema.optional(),
  title: localizedTextSchema,
  objectives: localizedListSchema,
  passingPercent: z.number().int().min(1).max(100).default(70),
  questions: z.array(questionContentSchema).min(1).max(50),
});
export type AssessmentContent = z.infer<typeof assessmentContentSchema>;

export const exerciseTestSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1).max(120),
  /** Python code run after the learner's code; raises AssertionError on failure. */
  code: z.string().min(1),
});

export const exerciseContentSchema = z.object({
  id: contentIdSchema,
  version: z.number().int().positive(),
  status: contentStatusSchema,
  lessonId: contentIdSchema,
  language: z.literal('python'),
  title: localizedTextSchema,
  prompt: localizedTextSchema,
  starterCode: z.string(),
  tests: z.array(exerciseTestSchema).min(1).max(20),
  hints: localizedListSchema,
  solution: z.string().min(1),
  topics: z.array(contentIdSchema).min(1),
});
export type ExerciseContent = z.infer<typeof exerciseContentSchema>;
