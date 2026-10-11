import { Types } from 'mongoose';
import { ProfileModel } from '../../db/models/profile.model';
import { LearningEventModel, type LearningEventType } from '../../db/models/progress.model';

export const XP = {
  lessonCompleted: 20,
  assessmentPassed: 30,
  exercisePassed: 15,
  projectMilestone: 25,
  projectSubmitted: 50,
} as const;

/** Calendar day in UTC (YYYY-MM-DD). Streaks use UTC days — documented limitation. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface ActivityInput {
  type: LearningEventType;
  refId?: string | null;
  courseId?: string | null;
  title?: string | null;
  topics?: string[];
  xp?: number;
}

export interface LearnerStatsResult {
  xp: number;
  currentStreak: number;
  longestStreak: number;
}

/** A streak only counts if the learner was active today or yesterday. */
export function effectiveStreak(
  stats: { currentStreak?: number | null; lastActiveDay?: string | null } | null | undefined,
  now: Date = new Date(),
): number {
  if (!stats?.lastActiveDay) return 0;
  const today = utcDay(now);
  const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
  return stats.lastActiveDay === today || stats.lastActiveDay === yesterday
    ? (stats.currentStreak ?? 0)
    : 0;
}

export class LearningService {
  async stats(userId: string): Promise<LearnerStatsResult> {
    const profile = await ProfileModel.findOne(
      { userId: new Types.ObjectId(userId) },
      { stats: 1 },
    ).lean();
    return {
      xp: profile?.stats?.xp ?? 0,
      currentStreak: effectiveStreak(profile?.stats),
      longestStreak: profile?.stats?.longestStreak ?? 0,
    };
  }

  /**
   * Records a learning event and updates XP + streak atomically with a pipeline update, so two
   * concurrent completions can never double-count a day or lose XP.
   */
  async recordActivity(
    userId: string,
    input: ActivityInput,
    options: { countsForStreak?: boolean; now?: Date } = {},
  ): Promise<LearnerStatsResult | null> {
    const now = options.now ?? new Date();
    const today = utcDay(now);
    const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
    const xp = Math.max(0, input.xp ?? 0);
    const uid = new Types.ObjectId(userId);

    await LearningEventModel.create({
      userId: uid,
      type: input.type,
      refId: input.refId ?? null,
      courseId: input.courseId ?? null,
      title: input.title?.slice(0, 200) ?? null,
      topics: input.topics ?? [],
      xp,
      at: now,
    });
    // Browsing (e.g. opening a lesson) is logged but does not keep a streak alive.
    if (options.countsForStreak === false) return null;

    const updated = await ProfileModel.collection.findOneAndUpdate(
      { userId: uid },
      [
        {
          $set: {
            'stats.currentStreak': {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$stats.lastActiveDay', today] },
                    then: { $ifNull: ['$stats.currentStreak', 1] },
                  },
                  {
                    case: { $eq: ['$stats.lastActiveDay', yesterday] },
                    then: { $add: [{ $ifNull: ['$stats.currentStreak', 0] }, 1] },
                  },
                ],
                default: 1,
              },
            },
            'stats.xp': { $add: [{ $ifNull: ['$stats.xp', 0] }, xp] },
            'stats.lastActiveDay': today,
          },
        },
        {
          $set: {
            'stats.longestStreak': {
              $max: [{ $ifNull: ['$stats.longestStreak', 0] }, '$stats.currentStreak'],
            },
          },
        },
      ],
      { returnDocument: 'after', upsert: false },
    );

    const stats = (updated as { stats?: Partial<LearnerStatsResult> } | null)?.stats;
    return {
      xp: stats?.xp ?? 0,
      currentStreak: stats?.currentStreak ?? 0,
      longestStreak: stats?.longestStreak ?? 0,
    };
  }
}
