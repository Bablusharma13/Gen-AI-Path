import { model, Schema } from 'mongoose';

/** Interview question bank, seeded from `content/career/interview-questions.yaml`. */
const interviewQuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    category: { type: String, required: true },
    level: { type: String, required: true },
    tracks: { type: [String], default: [] },
    question: { type: Schema.Types.Mixed, required: true },
    keyPoints: { type: Schema.Types.Mixed, required: true },
    sampleAnswer: { type: Schema.Types.Mixed, required: true },
    followUps: { type: Schema.Types.Mixed, default: null },
    relatedLessonIds: { type: [String], default: [] },
    order: { type: Number, required: true },
    contentHash: { type: String, required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'interviewQuestions' },
);
interviewQuestionSchema.index({ status: 1, archivedAt: 1, category: 1, order: 1 });

/** A learner's private self-assessment of one interview question. */
const interviewPracticeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: String, required: true },
    status: { type: String, enum: ['needs_practice', 'confident', null], default: null },
    notes: { type: String, default: '', maxlength: 4000 },
  },
  { timestamps: true, collection: 'interviewPractice' },
);
interviewPracticeSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export const InterviewQuestionModel = model('InterviewQuestion', interviewQuestionSchema);
export const InterviewPracticeModel = model('InterviewPractice', interviewPracticeSchema);
