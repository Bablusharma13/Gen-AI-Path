import {
  scoreAttempt,
  type AssessmentDto,
  type AssessmentListItemDto,
  type AttemptInput,
  type AttemptResultDto,
  type LocalizedList,
  type LocalizedText,
  type PublicQuestionDto,
  type QuestionContent,
} from '@genpath/shared';
import { Types } from 'mongoose';
import { AssessmentModel, CourseModel, LessonModel, LIVE } from '../../db/models/curriculum.model';
import { AssessmentAttemptModel } from '../../db/models/progress.model';
import { AppError, notFound } from '../../lib/errors';
import { XP, type LearningService } from '../learning/learning.service';

const oid = (id: string) => new Types.ObjectId(id);

/** Strips answer keys, rubrics and sample answers. The only path by which questions leave the API. */
export function toPublicQuestion(q: QuestionContent): PublicQuestionDto {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    topics: q.topics,
    ...(q.type === 'short_text'
      ? {}
      : { options: q.options.map((o) => ({ id: o.id, text: o.text })) }),
  };
}

export class AssessmentService {
  constructor(private readonly learning: LearningService) {}

  private async attemptStats(userId: string, assessmentIds: string[]) {
    const rows = await AssessmentAttemptModel.aggregate<{
      _id: string;
      count: number;
      best: number;
      passed: boolean;
      last: Date;
    }>([
      { $match: { userId: oid(userId), assessmentId: { $in: assessmentIds } } },
      {
        $group: {
          _id: '$assessmentId',
          count: { $sum: 1 },
          best: { $max: '$percent' },
          passed: { $max: '$passed' },
          last: { $max: '$createdAt' },
        },
      },
    ]);
    return new Map(rows.map((r) => [r._id, r]));
  }

  async list(userId: string): Promise<AssessmentListItemDto[]> {
    const assessments = await AssessmentModel.find(LIVE, {
      courseId: 1,
      lessonId: 1,
      title: 1,
      passingPercent: 1,
      questions: 1,
    }).lean();
    const [courses, lessons, stats] = await Promise.all([
      CourseModel.find(
        { _id: { $in: [...new Set(assessments.map((a) => a.courseId))] } },
        { slug: 1, title: 1, level: 1, order: 1 },
      ).lean(),
      LessonModel.find(
        {
          _id: {
            $in: assessments.map((a) => a.lessonId).filter((id): id is string => Boolean(id)),
          },
        },
        { slug: 1, order: 1 },
      ).lean(),
      this.attemptStats(
        userId,
        assessments.map((a) => a._id),
      ),
    ]);
    const courseById = new Map(courses.map((c) => [c._id, c]));
    const lessonById = new Map(lessons.map((l) => [l._id, l]));

    return assessments
      .map((a) => {
        const course = courseById.get(a.courseId);
        const lesson = a.lessonId ? lessonById.get(a.lessonId) : undefined;
        const s = stats.get(a._id);
        return {
          sortKey: [course?.level ?? 99, course?.order ?? 0, lesson?.order ?? 999] as const,
          item: {
            id: a._id,
            courseId: a.courseId,
            courseSlug: course?.slug ?? a.courseId,
            courseTitle: (course?.title ?? a.title) as LocalizedText,
            lessonId: a.lessonId ?? null,
            lessonSlug: lesson?.slug ?? null,
            title: a.title as LocalizedText,
            questionCount: (a.questions as unknown[]).length,
            passingPercent: a.passingPercent,
            attempts: s?.count ?? 0,
            bestPercent: s?.best ?? null,
            passed: s?.passed ?? false,
            lastAttemptAt: s?.last?.toISOString() ?? null,
          } satisfies AssessmentListItemDto,
        };
      })
      .sort(
        (x, y) =>
          x.sortKey[0] - y.sortKey[0] || x.sortKey[1] - y.sortKey[1] || x.sortKey[2] - y.sortKey[2],
      )
      .map((x) => x.item);
  }

  private async live(assessmentId: string) {
    const assessment = await AssessmentModel.findOne({ _id: assessmentId, ...LIVE }).lean();
    if (!assessment) throw notFound('Assessment');
    return assessment;
  }

  async get(assessmentId: string, userId: string): Promise<AssessmentDto> {
    const a = await this.live(assessmentId);
    const s = (await this.attemptStats(userId, [a._id])).get(a._id);
    return {
      id: a._id,
      courseId: a.courseId,
      lessonId: a.lessonId ?? null,
      title: a.title as LocalizedText,
      objectives: a.objectives as LocalizedList,
      passingPercent: a.passingPercent,
      questions: (a.questions as QuestionContent[]).map(toPublicQuestion),
      attempts: { count: s?.count ?? 0, bestPercent: s?.best ?? null, passed: s?.passed ?? false },
    };
  }

  async submit(
    userId: string,
    assessmentId: string,
    input: AttemptInput,
  ): Promise<AttemptResultDto> {
    const a = await this.live(assessmentId);
    const questions = a.questions as QuestionContent[];
    const known = new Set(questions.map((q) => q.id));
    const unknown = input.answers.find((ans) => !known.has(ans.questionId));
    if (unknown) throw new AppError('VALIDATION_ERROR', `Unknown question "${unknown.questionId}"`);
    if (new Set(input.answers.map((x) => x.questionId)).size !== input.answers.length) {
      throw new AppError('VALIDATION_ERROR', 'Each question can be answered once');
    }

    const scored = scoreAttempt(questions, input.answers, a.passingPercent);
    const alreadyPassed = Boolean(
      await AssessmentAttemptModel.exists({
        userId: oid(userId),
        assessmentId: a._id,
        passed: true,
      }),
    );
    const durationSec = input.startedAt
      ? Math.max(0, Math.min(86_400, Math.round((Date.now() - Date.parse(input.startedAt)) / 1000)))
      : null;

    const attempt = await AssessmentAttemptModel.create({
      userId: oid(userId),
      assessmentId: a._id,
      assessmentVersion: a.version,
      courseId: a.courseId,
      lessonId: a.lessonId ?? null,
      answers: input.answers,
      results: scored.results.map((r) => ({
        questionId: r.questionId,
        answered: (r.selectedOptionIds?.length ?? 0) > 0 || (r.text ?? '').trim().length > 0,
        correct: r.correct,
        partial: r.partial,
        points: r.points,
        pointsAwarded: r.pointsAwarded,
        topics: r.topics,
      })),
      score: scored.score,
      maxScore: scored.maxScore,
      percent: scored.percent,
      passed: scored.passed,
      durationSec,
    });

    const xpAwarded = scored.passed && !alreadyPassed ? XP.assessmentPassed : 0;
    await this.learning.recordActivity(userId, {
      type: 'assessment_submitted',
      refId: a._id,
      courseId: a.courseId,
      title: `${(a.title as LocalizedText).en} — ${scored.percent}%`,
      topics: [...new Set(scored.results.filter((r) => !r.correct).flatMap((r) => r.topics))],
      xp: xpAwarded,
    });

    return {
      id: attempt._id.toString(),
      assessmentId: a._id,
      score: scored.score,
      maxScore: scored.maxScore,
      percent: scored.percent,
      passed: scored.passed,
      passingPercent: a.passingPercent,
      createdAt: attempt.createdAt.toISOString(),
      results: scored.results,
      xpAwarded,
    };
  }

  async history(userId: string, assessmentId: string) {
    await this.live(assessmentId);
    const attempts = await AssessmentAttemptModel.find(
      { userId: oid(userId), assessmentId },
      { score: 1, maxScore: 1, percent: 1, passed: 1, createdAt: 1, durationSec: 1 },
    )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return attempts.map((x) => ({
      id: x._id.toString(),
      score: x.score,
      maxScore: x.maxScore,
      percent: x.percent,
      passed: x.passed,
      durationSec: x.durationSec ?? null,
      createdAt: x.createdAt.toISOString(),
    }));
  }
}
