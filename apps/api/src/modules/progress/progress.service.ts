import type {
  LessonStatus,
  LocalizedText,
  ProgressSummaryDto,
  WeakTopicDto,
} from '@genpath/shared';
import { Types } from 'mongoose';
import { CourseModel, LessonModel, LIVE } from '../../db/models/curriculum.model';
import { ProfileModel } from '../../db/models/profile.model';
import {
  AssessmentAttemptModel,
  EnrollmentModel,
  LearningEventModel,
  LessonProgressModel,
} from '../../db/models/progress.model';
import type { CurriculumService } from '../curriculum/curriculum.service';
import { lessonRefs } from '../curriculum/refs';
import { effectiveStreak, utcDay } from '../learning/learning.service';
import type { RoadmapService } from '../roadmap/roadmap.service';

const WEAK_TOPIC_WINDOW_DAYS = 60;
const MIN_MISSES_FOR_WEAK_TOPIC = 2;
const MIN_ATTEMPTS_WITH_MISSES = 2;

export const topicLabel = (topic: string) => topic.replaceAll('-', ' ');

interface TopicTally {
  answered: number;
  missed: number;
  attempts: Set<string>;
  attemptsWithMisses: Set<string>;
  latestMissed: boolean;
}

/**
 * Transparent weak-topic rule: a topic is weak only when, in the last 60 days, the learner missed
 * at least two questions on it, in at least two separate attempts, AND their most recent answer on
 * it was still wrong. Skipped questions are not counted. One bad attempt never labels anyone, and
 * recovering clears the flag.
 */
export function computeWeakTopics(
  attempts: { id: string; results: { correct: boolean; answered?: boolean; topics: string[] }[] }[],
): Omit<WeakTopicDto, 'suggestedLessons'>[] {
  const tally = new Map<string, TopicTally>();
  for (const attempt of attempts) {
    const latestInAttempt = new Map<string, boolean>();
    for (const r of attempt.results) {
      if (r.answered === false) continue;
      for (const topic of r.topics) {
        const t = tally.get(topic) ?? {
          answered: 0,
          missed: 0,
          attempts: new Set<string>(),
          attemptsWithMisses: new Set<string>(),
          latestMissed: false,
        };
        t.answered += 1;
        if (!r.correct) {
          t.missed += 1;
          t.attemptsWithMisses.add(attempt.id);
        }
        t.attempts.add(attempt.id);
        tally.set(topic, t);
        latestInAttempt.set(topic, (latestInAttempt.get(topic) ?? false) || !r.correct);
      }
    }
    // Attempts are processed oldest → newest, so the last write wins.
    for (const [topic, missed] of latestInAttempt) tally.get(topic)!.latestMissed = missed;
  }
  return [...tally.entries()]
    .filter(
      ([, t]) =>
        t.missed >= MIN_MISSES_FOR_WEAK_TOPIC &&
        t.attemptsWithMisses.size >= MIN_ATTEMPTS_WITH_MISSES &&
        t.latestMissed,
    )
    .sort((a, b) => b[1].missed - a[1].missed)
    .slice(0, 5)
    .map(([topic, t]) => ({
      topic,
      missed: t.missed,
      answered: t.answered,
      attempts: t.attempts.size,
      evidence: `Missed ${t.missed} of ${t.answered} questions on “${topicLabel(topic)}” across ${t.attempts.size} attempt${t.attempts.size === 1 ? '' : 's'} in the last ${WEAK_TOPIC_WINDOW_DAYS} days, and your latest answer on it was incorrect.`,
    }));
}

export class ProgressService {
  constructor(
    private readonly curriculum: CurriculumService,
    private readonly roadmap: RoadmapService,
  ) {}

  async weakTopics(userId: string): Promise<WeakTopicDto[]> {
    const since = new Date(Date.now() - WEAK_TOPIC_WINDOW_DAYS * 86_400_000);
    const attempts = await AssessmentAttemptModel.find(
      { userId: new Types.ObjectId(userId), createdAt: { $gte: since } },
      { results: 1, createdAt: 1 },
    )
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    const weak = computeWeakTopics(
      attempts.map((a) => ({
        id: a._id.toString(),
        results: a.results.map((r) => ({
          correct: Boolean(r.correct),
          answered: r.answered !== false,
          topics: r.topics ?? [],
        })),
      })),
    );
    return Promise.all(
      weak.map(async (w) => {
        const lessons = await LessonModel.find({ topics: w.topic, ...LIVE }, { _id: 1 })
          .sort({ order: 1 })
          .limit(2)
          .lean();
        return { ...w, suggestedLessons: await lessonRefs(lessons.map((l) => l._id)) };
      }),
    );
  }

  private async continueLearning(userId: string): Promise<ProgressSummaryDto['continueLearning']> {
    const uid = new Types.ObjectId(userId);
    const recent = await LessonProgressModel.findOne({ userId: uid, status: 'in_progress' })
      .sort({ updatedAt: -1 })
      .lean();
    let lessonId: string | null = recent?.lessonId ?? null;
    let status: LessonStatus = 'in_progress';

    if (!lessonId) {
      const lastDone = await LessonProgressModel.findOne({ userId: uid, status: 'completed' })
        .sort({ completedAt: -1 })
        .lean();
      if (lastDone) {
        const current = await LessonModel.findOne(
          { _id: lastDone.lessonId },
          { courseId: 1, order: 1 },
        ).lean();
        const next = current
          ? await LessonModel.findOne(
              { courseId: current.courseId, order: { $gt: current.order }, ...LIVE },
              { _id: 1 },
            )
              .sort({ order: 1 })
              .lean()
          : null;
        if (
          next &&
          !(await LessonProgressModel.exists({
            userId: uid,
            lessonId: next._id,
            status: 'completed',
          }))
        ) {
          lessonId = next._id;
          status = 'not_started';
        }
      }
    }
    if (!lessonId) return null;
    const [ref] = await lessonRefs([lessonId]);
    if (!ref) return null;
    const lesson = await LessonModel.findById(lessonId, { courseId: 1 }).lean();
    const course = lesson ? await CourseModel.findById(lesson.courseId, { title: 1 }).lean() : null;
    return { ...ref, courseTitle: (course?.title ?? ref.title) as LocalizedText, status };
  }

  private async recommendedLesson(
    userId: string,
  ): Promise<ProgressSummaryDto['recommendedLesson']> {
    const roadmap = await this.roadmap.get(userId);
    const item =
      roadmap.items.find((i) => i.status === 'recommended') ??
      roadmap.items.find((i) => i.status === 'in_progress');
    if (!item) return null;
    const done = await LessonProgressModel.find(
      { userId: new Types.ObjectId(userId), courseId: item.courseId, status: 'completed' },
      { lessonId: 1 },
    ).lean();
    const lesson = await LessonModel.findOne(
      { courseId: item.courseId, _id: { $nin: done.map((d) => d.lessonId) }, ...LIVE },
      { _id: 1 },
    )
      .sort({ order: 1 })
      .lean();
    if (!lesson) return null;
    const [ref] = await lessonRefs([lesson._id]);
    if (!ref) return null;
    const reason =
      item.reasons.filter((r) => r !== 'Recommended next')[0] ?? 'Next on your roadmap';
    return { ...ref, courseTitle: item.title, reason };
  }

  async summary(userId: string): Promise<ProgressSummaryDto> {
    const uid = new Types.ObjectId(userId);
    const now = new Date();
    const startOfToday = new Date(`${utcDay(now)}T00:00:00.000Z`);
    const weekStart = new Date(startOfToday.getTime() - 6 * 86_400_000);

    const [
      profile,
      completedLessons,
      courses,
      counts,
      enrollments,
      events,
      weekEvents,
      weakTopics,
      continueLearning,
      recommendedLesson,
    ] = await Promise.all([
      ProfileModel.findOne({ userId: uid }, { stats: 1, preferences: 1 }).lean(),
      LessonProgressModel.countDocuments({ userId: uid, status: 'completed' }),
      CourseModel.find(LIVE, { slug: 1, title: 1, lessonCount: 1 }).lean(),
      this.curriculum.courseProgress(userId),
      EnrollmentModel.find({ userId: uid }, { courseId: 1, lastActivityAt: 1 })
        .sort({ lastActivityAt: -1 })
        .lean(),
      LearningEventModel.find({ userId: uid }, { type: 1, title: 1, at: 1 })
        .sort({ at: -1 })
        .limit(8)
        .lean(),
      LearningEventModel.find({ userId: uid, at: { $gte: weekStart } }, { type: 1, at: 1 }).lean(),
      this.weakTopics(userId),
      this.continueLearning(userId),
      this.recommendedLesson(userId),
    ]);

    const courseById = new Map(courses.map((c) => [c._id, c]));
    const coursesInProgress = enrollments
      .map((e) => courseById.get(e.courseId))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        id: c._id,
        slug: c.slug,
        title: c.title as LocalizedText,
        percent: c.lessonCount
          ? Math.round(
              (Math.min(counts.get(c._id)?.completed ?? 0, c.lessonCount) / c.lessonCount) * 100,
            )
          : 0,
      }))
      .filter((c) => c.percent < 100)
      .slice(0, 4);

    const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
      const day = utcDay(new Date(weekStart.getTime() + i * 86_400_000));
      return { day, count: weekEvents.filter((e) => utcDay(e.at) === day).length };
    });
    const todayEvents = weekEvents.filter((e) => e.at >= startOfToday);

    return {
      continueLearning,
      recommendedLesson,
      completedLessons,
      totalLessons: courses.reduce((sum, c) => sum + c.lessonCount, 0),
      coursesInProgress,
      stats: {
        xp: profile?.stats?.xp ?? 0,
        currentStreak: effectiveStreak(profile?.stats, now),
        longestStreak: profile?.stats?.longestStreak ?? 0,
        lastActiveDay: profile?.stats?.lastActiveDay ?? null,
      },
      today: {
        minutesGoal: profile?.preferences?.dailyMinutes ?? 30,
        lessonsCompleted: todayEvents.filter((e) => e.type === 'lesson_completed').length,
        activities: todayEvents.length,
      },
      weakTopics,
      recentActivity: events.map((e) => ({
        type: e.type,
        title: e.title ?? e.type,
        at: e.at.toISOString(),
      })),
      weeklyActivity,
    };
  }
}
