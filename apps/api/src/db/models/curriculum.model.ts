import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * Curriculum documents are seeded from validated YAML in `content/` (the reviewed source of
 * truth). Nested localized structures are stored as Mixed because the Zod content schema already
 * validated them; top-level fields used for queries are typed and indexed.
 */

const courseSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    level: { type: Number, required: true },
    order: { type: Number, required: true },
    tracks: { type: [String], default: [] },
    requiredForTracks: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    likelyKnownBy: { type: [String], default: [] },
    estimatedHours: { type: Number, required: true },
    title: { type: Schema.Types.Mixed, required: true },
    summary: { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed, required: true },
    outcomes: { type: Schema.Types.Mixed, required: true },
    modules: { type: Schema.Types.Mixed, required: true },
    lessonCount: { type: Number, required: true },
    searchText: { type: String, default: '' },
    contentHash: { type: String, required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
courseSchema.index({ status: 1, archivedAt: 1, level: 1, order: 1 });
courseSchema.index({ searchText: 'text' }, { default_language: 'none', name: 'course_text' });

const lessonSchema = new Schema(
  {
    _id: { type: String, required: true },
    courseId: { type: String, required: true },
    moduleId: { type: String, required: true },
    /** Position within the course (0-based, across modules). */
    order: { type: Number, required: true },
    slug: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    title: { type: Schema.Types.Mixed, required: true },
    summary: { type: Schema.Types.Mixed, required: true },
    estimatedMinutes: { type: Number, required: true },
    prerequisites: { type: [String], default: [] },
    objectives: { type: Schema.Types.Mixed, required: true },
    topics: { type: [String], default: [] },
    sections: { type: Schema.Types.Mixed, required: true },
    codeExamples: { type: Schema.Types.Mixed, default: [] },
    lab: { type: Schema.Types.Mixed, default: null },
    exerciseIds: { type: [String], default: [] },
    assessmentId: { type: String, default: null },
    projectIds: { type: [String], default: [] },
    relatedLessonIds: { type: [String], default: [] },
    searchText: { type: String, default: '' },
    contentHash: { type: String, required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
lessonSchema.index({ courseId: 1, order: 1 });
lessonSchema.index({ courseId: 1, slug: 1 }, { unique: true });
lessonSchema.index({ topics: 1 });
lessonSchema.index({ searchText: 'text' }, { default_language: 'none', name: 'lesson_text' });

const assessmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    courseId: { type: String, required: true },
    lessonId: { type: String, default: null },
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    title: { type: Schema.Types.Mixed, required: true },
    objectives: { type: Schema.Types.Mixed, required: true },
    passingPercent: { type: Number, required: true },
    /** Includes answer keys. Only ever sent to clients through the public DTO mapper. */
    questions: { type: Schema.Types.Mixed, required: true },
    contentHash: { type: String, required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
assessmentSchema.index({ courseId: 1 });
assessmentSchema.index({ lessonId: 1 });

const exerciseSchema = new Schema(
  {
    _id: { type: String, required: true },
    lessonId: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    language: { type: String, enum: ['python'], required: true },
    title: { type: Schema.Types.Mixed, required: true },
    prompt: { type: Schema.Types.Mixed, required: true },
    starterCode: { type: String, default: '' },
    tests: { type: Schema.Types.Mixed, required: true },
    hints: { type: Schema.Types.Mixed, required: true },
    /** Reference solution: released only by the solution policy endpoint. */
    solution: { type: String, required: true, select: false },
    topics: { type: [String], default: [] },
    contentHash: { type: String, required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
exerciseSchema.index({ lessonId: 1 });

export type CourseDoc = InferSchemaType<typeof courseSchema>;
export type LessonDoc = InferSchemaType<typeof lessonSchema>;
export type AssessmentDoc = InferSchemaType<typeof assessmentSchema>;
export type ExerciseDoc = InferSchemaType<typeof exerciseSchema>;

export const CourseModel = model('Course', courseSchema);
export const LessonModel = model('Lesson', lessonSchema);
export const AssessmentModel = model('Assessment', assessmentSchema);
export const ExerciseModel = model('Exercise', exerciseSchema);

/** Filter for content visible to learners. */
export const LIVE = { status: 'published', archivedAt: null } as const;
