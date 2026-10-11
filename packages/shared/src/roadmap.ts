import { z } from 'zod';
import { contentIdSchema, type LocalizedText } from './common';
import { CAREER_GOAL_TRACK, type CareerGoal, type Experience, type Track } from './enums';
import { TRACK_LABELS } from './labels';

export type RoadmapItemStatus =
  'completed' | 'in_progress' | 'known' | 'recommended' | 'available' | 'locked';

export type RoadmapRelevance = 'required' | 'recommended' | 'optional';

export interface RoadmapCourseInput {
  id: string;
  slug: string;
  title: LocalizedText;
  level: number;
  order: number;
  tracks: Track[];
  requiredForTracks: Track[];
  prerequisites: string[];
  likelyKnownBy: Experience[];
  estimatedHours: number;
  lessonCount: number;
}

export interface RoadmapInput {
  careerGoal: CareerGoal | null;
  experience: Experience | null;
  dailyMinutes: number;
  knownCourseIds: string[];
  pinnedCourseIds: string[];
  courses: RoadmapCourseInput[];
  progress: Record<string, { completedLessons: number; startedLessons: number } | undefined>;
}

export interface RoadmapItemDto {
  courseId: string;
  slug: string;
  title: LocalizedText;
  level: number;
  estimatedHours: number;
  status: RoadmapItemStatus;
  relevance: RoadmapRelevance;
  reasons: string[];
  missingPrerequisites: { id: string; title: LocalizedText }[];
  pinned: boolean;
  progressPercent: number;
  /** Days to finish at the learner's daily pace (null when done or known). */
  estimatedDays: number | null;
}

export interface RoadmapDto {
  track: Track | null;
  careerGoal: CareerGoal | null;
  dailyMinutes: number;
  items: RoadmapItemDto[];
  summary: {
    totalHours: number;
    remainingHours: number;
    estimatedWeeks: number | null;
    completedCourses: number;
  };
}

export const roadmapItemUpdateSchema = z
  .object({
    known: z.boolean(),
    pinned: z.boolean(),
  })
  .partial()
  .refine((v) => v.known !== undefined || v.pinned !== undefined, 'Nothing to update');

export const roadmapItemParamsSchema = z.object({ courseId: contentIdSchema });

const RELEVANCE_RANK: Record<RoadmapRelevance, number> = {
  required: 0,
  recommended: 1,
  optional: 2,
};

/**
 * Transparent, rule-based roadmap. Every status comes with human-readable reasons so learners can
 * see (and challenge) why something is recommended or locked. Nothing is permanently hidden:
 * locked courses can still be opened, and any course can be marked as known.
 */
export function buildRoadmap(input: RoadmapInput): RoadmapDto {
  const track = input.careerGoal ? CAREER_GOAL_TRACK[input.careerGoal] : null;
  const known = new Set(input.knownCourseIds);
  const pinned = new Set(input.pinnedCourseIds);
  const byId = new Map(input.courses.map((c) => [c.id, c]));
  const sorted = [...input.courses].sort((a, b) => a.level - b.level || a.order - b.order);

  const isDone = (course: RoadmapCourseInput) => {
    const p = input.progress[course.id];
    return course.lessonCount > 0 && (p?.completedLessons ?? 0) >= course.lessonCount;
  };

  const items: RoadmapItemDto[] = sorted.map((course) => {
    const p = input.progress[course.id];
    const completed = Math.min(p?.completedLessons ?? 0, course.lessonCount);
    const progressPercent = course.lessonCount
      ? Math.round((completed / course.lessonCount) * 100)
      : 0;

    const relevance: RoadmapRelevance =
      track === null
        ? 'recommended'
        : course.requiredForTracks.includes(track)
          ? 'required'
          : course.tracks.includes(track)
            ? 'recommended'
            : 'optional';

    const reasons: string[] = [];
    if (track === null) reasons.push('Part of the core GenPath curriculum');
    else if (relevance === 'required')
      reasons.push(`Required for the ${TRACK_LABELS[track]} track`);
    else if (relevance === 'recommended')
      reasons.push(`Useful for the ${TRACK_LABELS[track]} track`);
    else reasons.push('Optional for your goal — explore it any time');

    const missingPrerequisites = course.prerequisites
      .map((id) => byId.get(id))
      .filter((c): c is RoadmapCourseInput => c !== undefined && !isDone(c) && !known.has(c.id))
      .map((c) => ({ id: c.id, title: c.title }));

    let status: RoadmapItemStatus;
    if (isDone(course)) {
      status = 'completed';
    } else if (known.has(course.id)) {
      status = 'known';
      reasons.push('Marked as known — it counts as done for prerequisites');
    } else if ((p?.completedLessons ?? 0) > 0 || (p?.startedLessons ?? 0) > 0) {
      status = 'in_progress';
    } else if (missingPrerequisites.length > 0) {
      status = 'locked';
      reasons.push(
        `Finish or mark as known first: ${missingPrerequisites.map((m) => m.title.en).join(', ')}`,
      );
    } else {
      status = 'available';
    }

    if (
      status !== 'completed' &&
      status !== 'known' &&
      input.experience &&
      course.likelyKnownBy.includes(input.experience)
    ) {
      reasons.push('Your experience probably covers this — skim it or mark it as known');
    }
    if (pinned.has(course.id)) reasons.push('Pinned by you');

    const remainingHours = course.estimatedHours * (1 - progressPercent / 100);
    const estimatedDays =
      status === 'completed' || status === 'known' || input.dailyMinutes <= 0
        ? null
        : Math.max(1, Math.ceil((remainingHours * 60) / input.dailyMinutes));

    return {
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      level: course.level,
      estimatedHours: course.estimatedHours,
      status,
      relevance,
      reasons,
      missingPrerequisites,
      pinned: pinned.has(course.id),
      progressPercent,
      estimatedDays,
    };
  });

  // Recommend the next one or two courses: pinned first, then by relevance, then path order.
  const inProgress = items.filter((i) => i.status === 'in_progress').length;
  const slots = Math.max(1, 2 - inProgress);
  const candidates = items
    .filter(
      (i) =>
        i.status === 'available' &&
        (i.relevance !== 'optional' || i.pinned) &&
        !(
          input.experience &&
          byId.get(i.courseId)?.likelyKnownBy.includes(input.experience) &&
          !i.pinned
        ),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance] ||
        a.level - b.level,
    );
  for (const item of candidates.slice(0, slots)) {
    item.status = 'recommended';
    item.reasons.unshift('Recommended next');
  }

  const counted = items.filter(
    (i) => i.relevance !== 'optional' || i.pinned || i.status === 'in_progress',
  );
  const totalHours = round1(counted.reduce((sum, i) => sum + i.estimatedHours, 0));
  const remainingHours = round1(
    counted
      .filter((i) => i.status !== 'completed' && i.status !== 'known')
      .reduce((sum, i) => sum + i.estimatedHours * (1 - i.progressPercent / 100), 0),
  );
  const weeklyHours = (input.dailyMinutes * 7) / 60;

  return {
    track,
    careerGoal: input.careerGoal,
    dailyMinutes: input.dailyMinutes,
    items,
    summary: {
      totalHours,
      remainingHours,
      estimatedWeeks: weeklyHours > 0 ? Math.ceil(remainingHours / weeklyHours) : null,
      completedCourses: items.filter((i) => i.status === 'completed').length,
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
