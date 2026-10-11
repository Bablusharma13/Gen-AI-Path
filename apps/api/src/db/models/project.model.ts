import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

/** Guided project templates, seeded from `content/projects`. */
const projectSchema = new Schema(
  {
    _id: { type: String, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    order: { type: Number, required: true },
    level: { type: String, required: true },
    tracks: { type: [String], default: [] },
    lessonIds: { type: [String], default: [] },
    /** Full validated project content (localized). */
    content: { type: Schema.Types.Mixed, required: true },
    contentHash: { type: String, required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
projectSchema.index({ status: 1, archivedAt: 1, order: 1 });

const milestoneStateSchema = new Schema(
  { id: { type: String, required: true }, completedAt: { type: Date, required: true } },
  { _id: false },
);

const projectProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: String, required: true },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'reviewed'],
      default: 'in_progress',
    },
    /** Bounded by the project's milestone count (≤ 12). */
    milestones: { type: [milestoneStateSchema], default: [] },
    /** Milestone ids that already earned XP, so un-ticking and re-ticking cannot farm XP. */
    xpAwardedMilestones: { type: [String], default: [] },
    startedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'projectProgress' },
);
projectProgressSchema.index({ userId: 1, projectId: 1 }, { unique: true });

const projectSubmissionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: String, required: true },
    projectVersion: { type: Number, required: true },
    repoUrl: { type: String, required: true, maxlength: 500 },
    demoUrl: { type: String, default: null, maxlength: 500 },
    notes: { type: String, default: '', maxlength: 4000 },
    checklist: {
      type: [{ criterionId: String, selfAssessed: Boolean, _id: false }],
      default: [],
    },
    status: { type: String, enum: ['submitted', 'reviewed'], default: 'submitted' },
    feedback: { type: String, default: null, maxlength: 4000 },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'projectSubmissions' },
);
projectSubmissionSchema.index({ userId: 1, projectId: 1, createdAt: -1 });
projectSubmissionSchema.index({ status: 1, createdAt: -1 });

export type ProjectDoc = InferSchemaType<typeof projectSchema>;
export type ProjectSubmission = InferSchemaType<typeof projectSubmissionSchema> & {
  _id: Types.ObjectId;
};

export const ProjectModel = model('Project', projectSchema);
export const ProjectProgressModel = model('ProjectProgress', projectProgressSchema);
export const ProjectSubmissionModel = model('ProjectSubmission', projectSubmissionSchema);
