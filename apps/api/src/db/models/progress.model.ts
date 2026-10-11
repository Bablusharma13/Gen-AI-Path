import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const enrollmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: String, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    lastLessonId: { type: String, default: null },
    lastActivityAt: { type: Date, required: true },
  },
  { timestamps: true },
);
enrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });
enrollmentSchema.index({ userId: 1, lastActivityAt: -1 });

const lessonProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessonId: { type: String, required: true },
    courseId: { type: String, required: true },
    status: { type: String, enum: ['in_progress', 'completed'], required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: '', maxlength: 10_000 },
    bookmarked: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'lessonProgress' },
);
lessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
lessonProgressSchema.index({ userId: 1, courseId: 1 });
lessonProgressSchema.index({ userId: 1, updatedAt: -1 });
lessonProgressSchema.index({ userId: 1, bookmarked: 1 });

const questionResultSchema = new Schema(
  {
    questionId: String,
    /** False when the learner left the question blank (not evidence of a weak topic). */
    answered: Boolean,
    correct: Boolean,
    partial: Boolean,
    points: Number,
    pointsAwarded: Number,
    topics: [String],
  },
  { _id: false },
);

const assessmentAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentId: { type: String, required: true },
    assessmentVersion: { type: Number, required: true },
    courseId: { type: String, required: true },
    lessonId: { type: String, default: null },
    /** The learner's raw answers (bounded by validation: ≤ 50 answers, ≤ 2000 chars each). */
    answers: { type: Schema.Types.Mixed, required: true },
    results: { type: [questionResultSchema], default: [] },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    percent: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    durationSec: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'assessmentAttempts' },
);
assessmentAttemptSchema.index({ userId: 1, assessmentId: 1, createdAt: -1 });
assessmentAttemptSchema.index({ userId: 1, createdAt: -1 });

const exerciseAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    exerciseId: { type: String, required: true },
    lessonId: { type: String, required: true },
    passed: { type: Boolean, required: true },
    testsPassed: { type: Number, required: true },
    testsTotal: { type: Number, required: true },
    hintsUsed: { type: Number, default: 0 },
    /** Exercises run in the learner's browser; results are self-reported, not graded. */
    verification: { type: String, enum: ['client'], default: 'client' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'exerciseAttempts' },
);
exerciseAttemptSchema.index({ userId: 1, exerciseId: 1, createdAt: -1 });

export const LEARNING_EVENT_TYPES = [
  'lesson_started',
  'lesson_completed',
  'assessment_submitted',
  'exercise_attempted',
  'lab_used',
  'mentor_question',
  'project_milestone',
  'project_submitted',
] as const;
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

const learningEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: LEARNING_EVENT_TYPES, required: true },
    refId: { type: String, default: null },
    courseId: { type: String, default: null },
    title: { type: String, default: null, maxlength: 200 },
    topics: { type: [String], default: [] },
    xp: { type: Number, default: 0 },
    at: { type: Date, required: true },
  },
  { collection: 'learningEvents' },
);
learningEventSchema.index({ userId: 1, at: -1 });
// Keep a year of activity history.
learningEventSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 86_400 });

export type Enrollment = InferSchemaType<typeof enrollmentSchema> & { _id: Types.ObjectId };
export type LessonProgress = InferSchemaType<typeof lessonProgressSchema> & { _id: Types.ObjectId };
export type AssessmentAttempt = InferSchemaType<typeof assessmentAttemptSchema> & {
  _id: Types.ObjectId;
};

export const EnrollmentModel = model('Enrollment', enrollmentSchema);
export const LessonProgressModel = model('LessonProgress', lessonProgressSchema);
export const AssessmentAttemptModel = model('AssessmentAttempt', assessmentAttemptSchema);
export const ExerciseAttemptModel = model('ExerciseAttempt', exerciseAttemptSchema);
export const LearningEventModel = model('LearningEvent', learningEventSchema);
