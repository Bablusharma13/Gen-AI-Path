import {
  CAREER_GOAL_TRACK,
  INTERVIEW_CATEGORIES,
  TRACK_LABELS,
  type CareerGoal,
  type CareerOverviewDto,
  type InterviewCategory,
  type InterviewPracticeInput,
  type InterviewQuestionDto,
  type LocalizedList,
  type LocalizedText,
  type PracticeStatus,
  type ReadinessItemDto,
  type SkillLevel,
  type Track,
} from '@genpath/shared';
import { Types } from 'mongoose';
import { InterviewPracticeModel, InterviewQuestionModel } from '../../db/models/career.model';
import { AssessmentModel, CourseModel, LIVE } from '../../db/models/curriculum.model';
import { ProfileModel } from '../../db/models/profile.model';
import { AssessmentAttemptModel } from '../../db/models/progress.model';
import { ProjectProgressModel } from '../../db/models/project.model';
import { notFound } from '../../lib/errors';
import type { CurriculumService } from '../curriculum/curriculum.service';
import { lessonRefs } from '../curriculum/refs';

const oid = (id: string) => new Types.ObjectId(id);

/** Thresholds shown to the learner next to each checklist item. */
export const READINESS_RULES = {
  confidentQuestions: 10,
} as const;

export interface QuestionFilters {
  category?: InterviewCategory | undefined;
  level?: SkillLevel | undefined;
  status?: PracticeStatus | 'unreviewed' | undefined;
}

export class CareerService {
  constructor(private readonly curriculum: CurriculumService) {}

  private async trackOf(userId: string): Promise<{ goal: CareerGoal | null; track: Track | null }> {
    const profile = await ProfileModel.findOne({ userId: oid(userId) }, { careerGoal: 1 }).lean();
    const goal = (profile?.careerGoal ?? null) as CareerGoal | null;
    return { goal, track: goal ? CAREER_GOAL_TRACK[goal] : null };
  }

  async listQuestions(userId: string, filters: QuestionFilters): Promise<InterviewQuestionDto[]> {
    const query: Record<string, unknown> = { ...LIVE };
    if (filters.category) query.category = filters.category;
    if (filters.level) query.level = filters.level;
    const [questions, practice] = await Promise.all([
      InterviewQuestionModel.find(query).sort({ order: 1 }).lean(),
      InterviewPracticeModel.find({ userId: oid(userId) }).lean(),
    ]);
    const practiceById = new Map(practice.map((p) => [p.questionId, p]));
    const refs = await lessonRefs([...new Set(questions.flatMap((q) => q.relatedLessonIds))]);
    const refById = new Map(refs.map((r) => [r.id, r]));

    return questions
      .map((q): InterviewQuestionDto => {
        const p = practiceById.get(q._id);
        return {
          id: q._id,
          category: q.category as InterviewCategory,
          level: q.level as SkillLevel,
          tracks: q.tracks as Track[],
          question: q.question as LocalizedText,
          keyPoints: q.keyPoints as LocalizedList,
          sampleAnswer: q.sampleAnswer as LocalizedText,
          followUps: (q.followUps as LocalizedList | null) ?? null,
          relatedLessons: q.relatedLessonIds.flatMap((id) => {
            const ref = refById.get(id);
            return ref ? [ref] : [];
          }),
          practice: {
            status: (p?.status ?? null) as PracticeStatus | null,
            notes: p?.notes ?? '',
            updatedAt: p ? (p as unknown as { updatedAt: Date }).updatedAt.toISOString() : null,
          },
        };
      })
      .filter((q) => {
        if (!filters.status) return true;
        if (filters.status === 'unreviewed') return q.practice.status === null;
        return q.practice.status === filters.status;
      });
  }

  async setPractice(
    userId: string,
    questionId: string,
    input: InterviewPracticeInput,
  ): Promise<InterviewQuestionDto['practice']> {
    const exists = await InterviewQuestionModel.exists({ _id: questionId, ...LIVE });
    if (!exists) throw notFound('Interview question');
    const update: Record<string, unknown> = { status: input.status };
    if (input.notes !== undefined) update.notes = input.notes;
    const row = await InterviewPracticeModel.findOneAndUpdate(
      { userId: oid(userId), questionId },
      { $set: update },
      { upsert: true, returnDocument: 'after' },
    ).lean();
    return {
      status: (row?.status ?? null) as PracticeStatus | null,
      notes: row?.notes ?? '',
      updatedAt: row ? (row as unknown as { updatedAt: Date }).updatedAt.toISOString() : null,
    };
  }

  /**
   * A transparent checklist computed from real progress. It deliberately avoids a single
   * "job-ready %" score: every item says exactly what was counted.
   */
  async overview(userId: string): Promise<CareerOverviewDto> {
    const uid = oid(userId);
    const { goal, track } = await this.trackOf(userId);
    const [courses, progress, assessments, passedIds, projects, questions, practice] =
      await Promise.all([
        CourseModel.find(LIVE, { requiredForTracks: 1, lessonCount: 1, slug: 1 }).lean(),
        this.curriculum.courseProgress(userId),
        AssessmentModel.find(LIVE, { _id: 1 }).lean(),
        AssessmentAttemptModel.distinct('assessmentId', { userId: uid, passed: true }),
        ProjectProgressModel.find({ userId: uid }, { status: 1 }).lean(),
        InterviewQuestionModel.find(LIVE, { category: 1, tracks: 1 }).lean(),
        InterviewPracticeModel.find({ userId: uid }, { questionId: 1, status: 1 }).lean(),
      ]);

    // Without a track, "core" means courses every track requires.
    const required = courses.filter((c) =>
      track
        ? c.requiredForTracks.includes(track)
        : c.requiredForTracks.length === Object.keys(TRACK_LABELS).length,
    );
    const completedRequired = required.filter((c) => {
      const p = progress.get(c._id);
      return c.lessonCount > 0 && (p?.completed ?? 0) >= c.lessonCount;
    }).length;
    const liveAssessmentIds = new Set(assessments.map((a) => a._id));
    const assessmentsPassed = new Set(
      passedIds.map(String).filter((id) => liveAssessmentIds.has(id)),
    ).size;
    const projectsSubmitted = projects.filter(
      (p) => p.status === 'submitted' || p.status === 'reviewed',
    ).length;
    const projectsReviewed = projects.filter((p) => p.status === 'reviewed').length;

    const relevant = questions.filter((q) => !track || q.tracks.includes(track));
    const statusById = new Map(practice.map((p) => [p.questionId, p.status]));
    const confident = relevant.filter((q) => statusById.get(q._id) === 'confident').length;
    const confidentTarget = Math.min(READINESS_RULES.confidentQuestions, relevant.length);

    const readiness: ReadinessItemDto[] = [
      {
        id: 'goal',
        label: 'Choose a career goal',
        detail: track
          ? `Track: ${TRACK_LABELS[track]}`
          : 'No specific track yet — core courses are used',
        done: goal !== null && goal !== 'general',
        href: '/settings',
      },
      {
        id: 'courses',
        label: 'Complete the core courses for your track',
        detail: `${completedRequired} of ${required.length} completed`,
        done: required.length > 0 && completedRequired === required.length,
        href: '/path',
      },
      {
        id: 'assessments',
        label: 'Pass every assessment',
        detail: `${assessmentsPassed} of ${liveAssessmentIds.size} passed`,
        done: liveAssessmentIds.size > 0 && assessmentsPassed === liveAssessmentIds.size,
        href: '/assessments',
      },
      {
        id: 'project-submitted',
        label: 'Ship at least one guided project',
        detail: `${projectsSubmitted} submitted`,
        done: projectsSubmitted > 0,
        href: '/projects',
      },
      {
        id: 'project-reviewed',
        label: 'Get reviewer feedback on a project',
        detail: `${projectsReviewed} reviewed`,
        done: projectsReviewed > 0,
        href: '/projects',
      },
      {
        id: 'interview',
        label: `Feel confident on ${confidentTarget} interview questions`,
        detail: `${confident} of ${relevant.length} marked confident (your own self-assessment)`,
        done: confidentTarget > 0 && confident >= confidentTarget,
        href: '/career#questions',
      },
    ];

    return {
      careerGoal: goal,
      track,
      readiness,
      counts: {
        requiredCourses: required.length,
        completedRequiredCourses: completedRequired,
        assessmentsPassed,
        assessmentsTotal: liveAssessmentIds.size,
        projectsSubmitted,
        projectsReviewed,
        questionsConfident: confident,
        questionsTotal: relevant.length,
      },
      byCategory: INTERVIEW_CATEGORIES.map((category) => {
        const inCategory = relevant.filter((q) => q.category === category);
        return {
          category,
          total: inCategory.length,
          confident: inCategory.filter((q) => statusById.get(q._id) === 'confident').length,
          needsPractice: inCategory.filter((q) => statusById.get(q._id) === 'needs_practice')
            .length,
        };
      }).filter((c) => c.total > 0),
    };
  }
}
