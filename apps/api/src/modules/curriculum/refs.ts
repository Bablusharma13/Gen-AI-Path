import type { LessonRefDto, LocalizedText } from '@genpath/shared';
import { CourseModel, LessonModel, LIVE } from '../../db/models/curriculum.model';

/** Resolves lesson ids to navigable references (id, slug, course slug, title), preserving order. */
export async function lessonRefs(ids: string[]): Promise<LessonRefDto[]> {
  if (ids.length === 0) return [];
  const lessons = await LessonModel.find(
    { _id: { $in: ids }, ...LIVE },
    { slug: 1, title: 1, courseId: 1 },
  ).lean();
  const courseIds = [...new Set(lessons.map((l) => l.courseId))];
  const courses = await CourseModel.find({ _id: { $in: courseIds }, ...LIVE }, { slug: 1 }).lean();
  const slugByCourse = new Map(courses.map((c) => [c._id, c.slug]));
  const byId = new Map(lessons.map((l) => [l._id, l]));
  return ids.flatMap((id) => {
    const l = byId.get(id);
    const courseSlug = l ? slugByCourse.get(l.courseId) : undefined;
    return l && courseSlug
      ? [{ id: l._id, slug: l.slug, courseSlug, title: l.title as LocalizedText }]
      : [];
  });
}
