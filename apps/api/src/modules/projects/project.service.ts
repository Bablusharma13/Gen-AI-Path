import type {
  LocalizedText,
  ProjectContent,
  ProjectDetailDto,
  ProjectStatus,
  ProjectSubmissionDto,
  ProjectSubmissionInput,
  ProjectSummaryDto,
  ReviewQueueItemDto,
} from '@genpath/shared';
import { Types } from 'mongoose';
import { LIVE } from '../../db/models/curriculum.model';
import { LessonProgressModel } from '../../db/models/progress.model';
import {
  ProjectModel,
  ProjectProgressModel,
  ProjectSubmissionModel,
} from '../../db/models/project.model';
import { UserModel } from '../../db/models/user.model';
import { AppError, notFound } from '../../lib/errors';
import { lessonRefs } from '../curriculum/refs';
import { XP, type LearningService } from '../learning/learning.service';

const oid = (id: string) => new Types.ObjectId(id);
const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/** Learners can resubmit (e.g. after feedback), but not flood the review queue. */
export const MAX_SUBMISSIONS_PER_PROJECT = 10;

/** Structural view of a submission document (lean or hydrated). */
interface SubmissionLike {
  _id: Types.ObjectId;
  repoUrl: string;
  demoUrl?: string | null;
  notes?: string | null;
  checklist?: readonly { criterionId?: string | null; selfAssessed?: boolean | null }[] | null;
  status: string;
  feedback?: string | null;
  createdAt?: Date;
}

function toSubmissionDto(
  s: SubmissionLike,
  reviewerName: string | null = null,
): ProjectSubmissionDto {
  return {
    id: s._id.toString(),
    repoUrl: s.repoUrl,
    demoUrl: s.demoUrl ?? null,
    notes: s.notes ?? '',
    checklist: (s.checklist ?? []).map((c) => ({
      criterionId: String(c.criterionId),
      selfAssessed: Boolean(c.selfAssessed),
    })),
    status: s.status as 'submitted' | 'reviewed',
    feedback: s.feedback ?? null,
    reviewerName,
    createdAt: (s.createdAt ?? new Date()).toISOString(),
  };
}

export class ProjectService {
  constructor(private readonly learning: LearningService) {}

  private async liveProject(projectId: string): Promise<ProjectContent> {
    const project = await ProjectModel.findOne({ _id: projectId, ...LIVE }, { content: 1 }).lean();
    if (!project) throw notFound('Project');
    return project.content as ProjectContent;
  }

  async list(userId: string): Promise<ProjectSummaryDto[]> {
    const [projects, progress] = await Promise.all([
      ProjectModel.find(LIVE, { content: 1 }).sort({ order: 1 }).lean(),
      ProjectProgressModel.find(
        { userId: oid(userId) },
        { projectId: 1, status: 1, milestones: 1 },
      ).lean(),
    ]);
    const byProject = new Map(progress.map((p) => [p.projectId, p]));
    return projects.map((doc) => {
      const p = doc.content as ProjectContent;
      const row = byProject.get(p.id);
      const milestoneIds = new Set(p.milestones.map((m) => m.id));
      return {
        id: p.id,
        title: p.title,
        summary: p.summary,
        level: p.level,
        estimatedHours: p.estimatedHours,
        tracks: p.tracks,
        techStack: p.techStack,
        milestoneCount: p.milestones.length,
        completedMilestones: (row?.milestones ?? []).filter((m) => milestoneIds.has(m.id)).length,
        status: (row?.status ?? 'not_started') as ProjectStatus,
      };
    });
  }

  async get(projectId: string, userId: string): Promise<ProjectDetailDto> {
    const p = await this.liveProject(projectId);
    const uid = oid(userId);
    const [progress, submissions, lessons, completedLessons] = await Promise.all([
      ProjectProgressModel.findOne({ userId: uid, projectId }).lean(),
      ProjectSubmissionModel.find({ userId: uid, projectId })
        .sort({ createdAt: -1 })
        .limit(MAX_SUBMISSIONS_PER_PROJECT)
        .lean(),
      lessonRefs(p.lessonIds),
      LessonProgressModel.find(
        { userId: uid, lessonId: { $in: p.lessonIds }, status: 'completed' },
        { lessonId: 1 },
      ).lean(),
    ]);
    const reviewerIds = [
      ...new Set(submissions.flatMap((s) => (s.reviewerId ? [s.reviewerId.toString()] : []))),
    ];
    const reviewers = reviewerIds.length
      ? await UserModel.find({ _id: { $in: reviewerIds } }, { name: 1 }).lean()
      : [];
    const reviewerName = new Map(reviewers.map((r) => [r._id.toString(), r.name]));
    const completedAt = new Map(
      (progress?.milestones ?? []).map((m) => [m.id, m.completedAt.toISOString()]),
    );
    const done = new Set(completedLessons.map((l) => l.lessonId));

    return {
      id: p.id,
      title: p.title,
      summary: p.summary,
      level: p.level,
      estimatedHours: p.estimatedHours,
      tracks: p.tracks,
      techStack: p.techStack,
      milestoneCount: p.milestones.length,
      status: (progress?.status ?? 'not_started') as ProjectStatus,
      problemStatement: p.problemStatement,
      requirements: p.requirements,
      acceptanceCriteria: p.acceptanceCriteria,
      architecture: p.architecture,
      dataModel: p.dataModel,
      apiDesign: p.apiDesign ?? null,
      milestones: p.milestones.map((m) => ({ ...m, completedAt: completedAt.get(m.id) ?? null })),
      testRequirements: p.testRequirements,
      securityChecklist: p.securityChecklist,
      deployment: p.deployment,
      readmeRequirements: p.readmeRequirements,
      rubric: p.rubric,
      lessons: lessons.map((l) => ({ ...l, completed: done.has(l.id) })),
      submissions: submissions.map((s) =>
        toSubmissionDto(
          s,
          s.reviewerId ? (reviewerName.get(s.reviewerId.toString()) ?? null) : null,
        ),
      ),
    };
  }

  /** Idempotent: starting an already-started project returns the existing state. */
  async start(userId: string, projectId: string): Promise<{ status: ProjectStatus }> {
    await this.liveProject(projectId);
    try {
      const row = await ProjectProgressModel.findOneAndUpdate(
        { userId: oid(userId), projectId },
        { $setOnInsert: { status: 'in_progress', milestones: [], startedAt: new Date() } },
        { upsert: true, returnDocument: 'after' },
      ).lean();
      return { status: (row?.status ?? 'in_progress') as ProjectStatus };
    } catch (err) {
      // Two concurrent starts: the unique index rejects one upsert; the row exists either way.
      if (!isDuplicateKey(err)) throw err;
      return { status: 'in_progress' };
    }
  }

  async setMilestone(
    userId: string,
    projectId: string,
    milestoneId: string,
    completed: boolean,
  ): Promise<{ completedMilestones: number; xpAwarded: number }> {
    const p = await this.liveProject(projectId);
    const milestone = p.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw notFound('Milestone');
    await this.start(userId, projectId);
    const filter = { userId: oid(userId), projectId };

    if (!completed) {
      await ProjectProgressModel.updateOne(filter, { $pull: { milestones: { id: milestoneId } } });
    } else {
      // Only adds the milestone if it is not already there (no duplicates on double clicks).
      await ProjectProgressModel.updateOne(
        { ...filter, 'milestones.id': { $ne: milestoneId } },
        { $push: { milestones: { id: milestoneId, completedAt: new Date() } } },
      );
    }

    let xpAwarded = 0;
    if (completed) {
      // XP once per milestone, ever — the conditional update makes this race-free.
      const awarded = await ProjectProgressModel.updateOne(
        { ...filter, xpAwardedMilestones: { $ne: milestoneId } },
        { $addToSet: { xpAwardedMilestones: milestoneId } },
      );
      if (awarded.modifiedCount === 1) {
        xpAwarded = XP.projectMilestone;
        await this.learning.recordActivity(userId, {
          type: 'project_milestone',
          refId: projectId,
          title: `${p.title.en} — ${milestone.title.en}`,
          xp: xpAwarded,
        });
      }
    }

    const row = await ProjectProgressModel.findOne(filter, { milestones: 1 }).lean();
    const valid = new Set(p.milestones.map((m) => m.id));
    return {
      completedMilestones: (row?.milestones ?? []).filter((m) => valid.has(m.id)).length,
      xpAwarded,
    };
  }

  async submit(
    userId: string,
    projectId: string,
    input: ProjectSubmissionInput,
  ): Promise<ProjectSubmissionDto> {
    const p = await this.liveProject(projectId);
    const rubricIds = new Set(p.rubric.map((r) => r.id));
    const unknown = input.checklist.find((c) => !rubricIds.has(c.criterionId));
    if (unknown) {
      throw new AppError('VALIDATION_ERROR', `Unknown rubric criterion "${unknown.criterionId}"`);
    }
    const uid = oid(userId);
    const existing = await ProjectSubmissionModel.countDocuments({ userId: uid, projectId });
    if (existing >= MAX_SUBMISSIONS_PER_PROJECT) {
      throw new AppError(
        'CONFLICT',
        `You can submit a project at most ${MAX_SUBMISSIONS_PER_PROJECT} times`,
      );
    }
    await this.start(userId, projectId);

    const submission = await ProjectSubmissionModel.create({
      userId: uid,
      projectId,
      projectVersion: p.version,
      repoUrl: input.repoUrl,
      demoUrl: input.demoUrl ?? null,
      notes: input.notes,
      checklist: input.checklist,
    });
    await ProjectProgressModel.updateOne(
      { userId: uid, projectId },
      { $set: { status: 'submitted' } },
    );
    await this.learning.recordActivity(userId, {
      type: 'project_submitted',
      refId: projectId,
      title: p.title.en,
      // XP for the first submission only; resubmissions are for feedback, not points.
      xp: existing === 0 ? XP.projectSubmitted : 0,
    });
    return toSubmissionDto(submission);
  }

  /** Submissions for reviewers. Only names are exposed — never emails or other learner data. */
  async reviewQueue(status: 'submitted' | 'reviewed'): Promise<ReviewQueueItemDto[]> {
    const submissions = await ProjectSubmissionModel.find({ status })
      .sort({ createdAt: status === 'submitted' ? 1 : -1 })
      .limit(100)
      .lean();
    const projectIds = [...new Set(submissions.map((s) => s.projectId))];
    const userIds = [
      ...new Set(
        submissions.flatMap((s) => [
          s.userId.toString(),
          ...(s.reviewerId ? [s.reviewerId.toString()] : []),
        ]),
      ),
    ];
    const [projects, users] = await Promise.all([
      ProjectModel.find({ _id: { $in: projectIds } }, { content: 1 }).lean(),
      UserModel.find({ _id: { $in: userIds } }, { name: 1 }).lean(),
    ]);
    const projectById = new Map(projects.map((p) => [p._id, p.content as ProjectContent]));
    const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
    return submissions.flatMap((s) => {
      const project = projectById.get(s.projectId);
      if (!project) return [];
      return [
        {
          ...toSubmissionDto(
            s,
            s.reviewerId ? (nameById.get(s.reviewerId.toString()) ?? null) : null,
          ),
          projectId: s.projectId,
          projectTitle: project.title as LocalizedText,
          learnerName: nameById.get(s.userId.toString()) ?? 'Unknown learner',
          rubric: project.rubric,
        },
      ];
    });
  }

  async review(
    reviewerId: string,
    submissionId: string,
    feedback: string,
  ): Promise<ProjectSubmissionDto> {
    const submission = await ProjectSubmissionModel.findById(submissionId).lean();
    if (!submission) throw notFound('Submission');
    if (submission.userId.equals(reviewerId)) {
      throw new AppError('FORBIDDEN', 'You cannot review your own submission');
    }
    const updated = await ProjectSubmissionModel.findOneAndUpdate(
      { _id: submission._id },
      {
        $set: { status: 'reviewed', feedback, reviewerId: oid(reviewerId), reviewedAt: new Date() },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!updated) throw notFound('Submission');
    await ProjectProgressModel.updateOne(
      { userId: submission.userId, projectId: submission.projectId },
      { $set: { status: 'reviewed' } },
    );
    const reviewer = await UserModel.findById(reviewerId, { name: 1 }).lean();
    return toSubmissionDto(updated, reviewer?.name ?? null);
  }
}
