import {
  buildRoadmap,
  type CareerGoal,
  type Experience,
  type LocalizedText,
  type RoadmapDto,
  type Track,
} from '@genpath/shared';
import { Types } from 'mongoose';
import { CourseModel, LIVE } from '../../db/models/curriculum.model';
import { ProfileModel } from '../../db/models/profile.model';
import { AppError, notFound } from '../../lib/errors';
import type { CurriculumService } from '../curriculum/curriculum.service';

const MAX_MARKED = 30;

export class RoadmapService {
  constructor(private readonly curriculum: CurriculumService) {}

  async get(userId: string): Promise<RoadmapDto> {
    const [profile, courses, counts] = await Promise.all([
      ProfileModel.findOne({ userId: new Types.ObjectId(userId) }).lean(),
      CourseModel.find(LIVE).lean(),
      this.curriculum.courseProgress(userId),
    ]);
    return buildRoadmap({
      careerGoal: (profile?.careerGoal ?? null) as CareerGoal | null,
      experience: (profile?.experience ?? null) as Experience | null,
      dailyMinutes: profile?.preferences?.dailyMinutes ?? 30,
      knownCourseIds: profile?.knownCourseIds ?? [],
      pinnedCourseIds: profile?.pinnedCourseIds ?? [],
      courses: courses.map((c) => ({
        id: c._id,
        slug: c.slug,
        title: c.title as LocalizedText,
        level: c.level,
        order: c.order,
        tracks: c.tracks as Track[],
        requiredForTracks: c.requiredForTracks as Track[],
        prerequisites: c.prerequisites,
        likelyKnownBy: c.likelyKnownBy as Experience[],
        estimatedHours: c.estimatedHours,
        lessonCount: c.lessonCount,
      })),
      progress: Object.fromEntries(
        [...counts.entries()].map(([id, c]) => [
          id,
          { completedLessons: c.completed, startedLessons: c.started },
        ]),
      ),
    });
  }

  async updateItem(
    userId: string,
    courseId: string,
    input: { known?: boolean; pinned?: boolean },
  ): Promise<RoadmapDto> {
    if (!(await CourseModel.exists({ _id: courseId, ...LIVE }))) throw notFound('Course');
    const uid = new Types.ObjectId(userId);
    const profile = await ProfileModel.findOne(
      { userId: uid },
      { knownCourseIds: 1, pinnedCourseIds: 1 },
    ).lean();
    if (!profile) throw notFound('Profile');

    const update: Record<string, Record<string, string>> = {};
    if (input.known !== undefined) {
      if (input.known && profile.knownCourseIds.length >= MAX_MARKED) {
        throw new AppError('BAD_REQUEST', 'Too many courses marked as known');
      }
      (input.known ? (update.$addToSet ??= {}) : (update.$pull ??= {})).knownCourseIds = courseId;
    }
    if (input.pinned !== undefined) {
      if (input.pinned && (profile.pinnedCourseIds ?? []).length >= MAX_MARKED) {
        throw new AppError('BAD_REQUEST', 'Too many pinned courses');
      }
      (input.pinned ? (update.$addToSet ??= {}) : (update.$pull ??= {})).pinnedCourseIds = courseId;
    }
    await ProfileModel.updateOne({ userId: uid }, update);
    return this.get(userId);
  }

  /** Clears customisations. Known courses are the learner's own declaration, so they are kept by default. */
  async reset(userId: string, keepKnown: boolean): Promise<RoadmapDto> {
    await ProfileModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { pinnedCourseIds: [], ...(keepKnown ? {} : { knownCourseIds: [] }) } },
    );
    return this.get(userId);
  }
}
