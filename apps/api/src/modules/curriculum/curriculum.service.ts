import type {
  CodeExample,
  CompleteLessonResultDto,
  CourseDetailDto,
  CourseProgressDto,
  CourseSummaryDto,
  LabId,
  LessonDto,
  LessonRefDto,
  LessonSections,
  LessonStatus,
  LessonSummaryDto,
  LocalizedList,
  LocalizedText,
  SearchResultDto,
  Track,
} from '@genpath/shared';
import { Types } from 'mongoose';
import {
  AssessmentModel,
  CourseModel,
  ExerciseModel,
  LessonModel,
  LIVE,
  type CourseDoc,
} from '../../db/models/curriculum.model';
import { ProfileModel } from '../../db/models/profile.model';
import {
  AssessmentAttemptModel,
  EnrollmentModel,
  ExerciseAttemptModel,
  LessonProgressModel,
} from '../../db/models/progress.model';
import { ProjectModel } from '../../db/models/project.model';
import { notFound } from '../../lib/errors';
import { XP, type LearningService } from '../learning/learning.service';
import { lessonRefs } from './refs';

type CourseLean = CourseDoc & { _id: string };
interface ModuleShape {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  lessonIds: string[];
}

const oid = (id: string) => new Types.ObjectId(id);
const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CurriculumService {
  constructor(private readonly learning: LearningService) {}

  /** Completed/started lesson counts per course for one learner. */
  async courseProgress(
    userId: string,
  ): Promise<Map<string, { completed: number; started: number }>> {
    const rows = await LessonProgressModel.aggregate<{
      _id: string;
      completed: number;
      started: number;
    }>([
      { $match: { userId: oid(userId) } },
      {
        $group: {
          _id: '$courseId',
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          started: { $sum: 1 },
        },
      },
    ]);
    return new Map(rows.map((r) => [r._id, { completed: r.completed, started: r.started }]));
  }

  private toProgress(
    course: CourseLean,
    counts: { completed: number; started: number } | undefined,
    lastLessonId: string | null,
  ): CourseProgressDto {
    const completed = Math.min(counts?.completed ?? 0, course.lessonCount);
    return {
      completedLessons: completed,
      totalLessons: course.lessonCount,
      status:
        course.lessonCount > 0 && completed >= course.lessonCount
          ? 'completed'
          : (counts?.started ?? 0) > 0
            ? 'in_progress'
            : 'not_started',
      lastLessonId,
    };
  }

  private toSummary(course: CourseLean, progress: CourseProgressDto): CourseSummaryDto {
    return {
      id: course._id,
      slug: course.slug,
      level: course.level,
      order: course.order,
      tracks: course.tracks as Track[],
      requiredForTracks: course.requiredForTracks as Track[],
      title: course.title as LocalizedText,
      summary: course.summary as LocalizedText,
      estimatedHours: course.estimatedHours,
      prerequisites: course.prerequisites,
      moduleCount: (course.modules as ModuleShape[]).length,
      lessonCount: course.lessonCount,
      progress,
    };
  }

  async listCourses(userId: string): Promise<CourseSummaryDto[]> {
    const [courses, counts, enrollments] = await Promise.all([
      CourseModel.find(LIVE).sort({ level: 1, order: 1 }).lean<CourseLean[]>(),
      this.courseProgress(userId),
      EnrollmentModel.find({ userId: oid(userId) }, { courseId: 1, lastLessonId: 1 }).lean(),
    ]);
    const lastLesson = new Map(enrollments.map((e) => [e.courseId, e.lastLessonId ?? null]));
    return courses.map((c) =>
      this.toSummary(c, this.toProgress(c, counts.get(c._id), lastLesson.get(c._id) ?? null)),
    );
  }

  private async findCourse(idOrSlug: string): Promise<CourseLean> {
    const course = await CourseModel.findOne({
      $or: [{ _id: idOrSlug }, { slug: idOrSlug }],
      ...LIVE,
    }).lean<CourseLean>();
    if (!course) throw notFound('Course');
    return course;
  }

  async getCourse(idOrSlug: string, userId: string): Promise<CourseDetailDto> {
    const course = await this.findCourse(idOrSlug);
    const [lessons, progressRows, enrollment, profile, prereqCourses, counts] = await Promise.all([
      LessonModel.find({ courseId: course._id, ...LIVE })
        .select('slug title summary estimatedMinutes topics lab exerciseIds assessmentId order')
        .sort({ order: 1 })
        .lean(),
      LessonProgressModel.find(
        { userId: oid(userId), courseId: course._id },
        { lessonId: 1, status: 1, bookmarked: 1 },
      ).lean(),
      EnrollmentModel.findOne(
        { userId: oid(userId), courseId: course._id },
        { lastLessonId: 1 },
      ).lean(),
      ProfileModel.findOne({ userId: oid(userId) }, { knownCourseIds: 1 }).lean(),
      CourseModel.find(
        { _id: { $in: course.prerequisites }, ...LIVE },
        { slug: 1, title: 1, lessonCount: 1 },
      ).lean<CourseLean[]>(),
      this.courseProgress(userId),
    ]);

    const progressByLesson = new Map(progressRows.map((p) => [p.lessonId, p]));
    const lessonById = new Map(lessons.map((l) => [l._id, l]));
    const known = new Set(profile?.knownCourseIds ?? []);

    const toLessonSummary = (id: string): LessonSummaryDto | null => {
      const l = lessonById.get(id);
      if (!l) return null;
      const p = progressByLesson.get(id);
      return {
        id: l._id,
        slug: l.slug,
        title: l.title as LocalizedText,
        summary: l.summary as LocalizedText,
        estimatedMinutes: l.estimatedMinutes,
        topics: l.topics,
        labId: ((l.lab as { id?: LabId } | null)?.id ?? null) as LabId | null,
        exerciseCount: l.exerciseIds.length,
        hasAssessment: Boolean(l.assessmentId),
        status: (p?.status ?? 'not_started') as LessonStatus,
        bookmarked: p?.bookmarked ?? false,
      };
    };

    return {
      ...this.toSummary(
        course,
        this.toProgress(course, counts.get(course._id), enrollment?.lastLessonId ?? null),
      ),
      description: course.description as LocalizedText,
      outcomes: course.outcomes as LocalizedList,
      modules: (course.modules as ModuleShape[]).map((m) => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        lessons: m.lessonIds.map(toLessonSummary).filter((l): l is LessonSummaryDto => l !== null),
      })),
      prerequisiteCourses: prereqCourses.map((c) => ({
        id: c._id,
        slug: c.slug,
        title: c.title as LocalizedText,
        satisfied:
          known.has(c._id) ||
          (c.lessonCount > 0 && (counts.get(c._id)?.completed ?? 0) >= c.lessonCount),
      })),
    };
  }

  async resolveLessonId(courseIdOrSlug: string, lessonSlug: string): Promise<string> {
    const course = await this.findCourse(courseIdOrSlug);
    const lesson = await LessonModel.findOne(
      { courseId: course._id, slug: lessonSlug, ...LIVE },
      { _id: 1 },
    ).lean();
    if (!lesson) throw notFound('Lesson');
    return lesson._id;
  }

  private async liveLesson(lessonId: string) {
    const lesson = await LessonModel.findOne({ _id: lessonId, ...LIVE }).lean();
    if (!lesson) throw notFound('Lesson');
    return lesson;
  }

  async getLesson(lessonId: string, userId: string): Promise<LessonDto> {
    const lesson = await this.liveLesson(lessonId);
    const uid = oid(userId);
    const [
      course,
      siblings,
      progress,
      prereqRefs,
      related,
      prereqProgress,
      exercises,
      exerciseStats,
      assessment,
      projects,
    ] = await Promise.all([
      CourseModel.findOne({ _id: lesson.courseId, ...LIVE }).lean<CourseLean>(),
      LessonModel.find({ courseId: lesson.courseId, ...LIVE }, { slug: 1, title: 1, order: 1 })
        .sort({ order: 1 })
        .lean(),
      LessonProgressModel.findOne({ userId: uid, lessonId }).lean(),
      lessonRefs(lesson.prerequisites),
      lessonRefs(lesson.relatedLessonIds),
      LessonProgressModel.find(
        { userId: uid, lessonId: { $in: lesson.prerequisites }, status: 'completed' },
        { lessonId: 1 },
      ).lean(),
      ExerciseModel.find({ _id: { $in: lesson.exerciseIds }, ...LIVE }, { title: 1 }).lean(),
      ExerciseAttemptModel.aggregate<{ _id: string; attempts: number; passed: boolean }>([
        { $match: { userId: uid, exerciseId: { $in: lesson.exerciseIds } } },
        { $group: { _id: '$exerciseId', attempts: { $sum: 1 }, passed: { $max: '$passed' } } },
      ]),
      lesson.assessmentId
        ? AssessmentModel.findOne(
            { _id: lesson.assessmentId, ...LIVE },
            { title: 1, questions: 1 },
          ).lean()
        : Promise.resolve(null),
      ProjectModel.find({ _id: { $in: lesson.projectIds }, ...LIVE }, { content: 1 }).lean(),
    ]);
    if (!course) throw notFound('Course');

    const bestAttempt = assessment
      ? await AssessmentAttemptModel.findOne({ userId: uid, assessmentId: assessment._id })
          .sort({ percent: -1 })
          .select('percent passed')
          .lean()
      : null;
    const passedAssessment = assessment
      ? Boolean(
          await AssessmentAttemptModel.exists({
            userId: uid,
            assessmentId: assessment._id,
            passed: true,
          }),
        )
      : false;

    const index = siblings.findIndex((s) => s._id === lesson._id);
    const ref = (s: (typeof siblings)[number] | undefined): LessonRefDto | null =>
      s
        ? { id: s._id, slug: s.slug, courseSlug: course.slug, title: s.title as LocalizedText }
        : null;
    const completedPrereqs = new Set(prereqProgress.map((p) => p.lessonId));
    const statsByExercise = new Map(exerciseStats.map((s) => [s._id, s]));
    const mod = (course.modules as ModuleShape[]).find((m) => m.id === lesson.moduleId);

    return {
      id: lesson._id,
      slug: lesson.slug,
      version: lesson.version,
      courseId: course._id,
      courseSlug: course.slug,
      courseTitle: course.title as LocalizedText,
      moduleId: lesson.moduleId,
      moduleTitle: mod?.title ?? (course.title as LocalizedText),
      title: lesson.title as LocalizedText,
      summary: lesson.summary as LocalizedText,
      estimatedMinutes: lesson.estimatedMinutes,
      objectives: lesson.objectives as LocalizedList,
      topics: lesson.topics,
      sections: lesson.sections as LessonSections,
      codeExamples: lesson.codeExamples as CodeExample[],
      lab: (lesson.lab as LessonDto['lab']) ?? null,
      exercises: exercises.map((e) => ({
        id: e._id,
        title: e.title as LocalizedText,
        passed: statsByExercise.get(e._id)?.passed ?? false,
        attempts: statsByExercise.get(e._id)?.attempts ?? 0,
      })),
      assessment: assessment
        ? {
            id: assessment._id,
            title: assessment.title as LocalizedText,
            questionCount: (assessment.questions as unknown[]).length,
            bestPercent: bestAttempt?.percent ?? null,
            passed: passedAssessment,
          }
        : null,
      projects: projects.map((p) => ({
        id: p._id,
        title: (p.content as { title: LocalizedText }).title,
      })),
      related,
      prerequisites: prereqRefs.map((r) => ({ ...r, completed: completedPrereqs.has(r.id) })),
      navigation: { previous: ref(siblings[index - 1]), next: ref(siblings[index + 1]) },
      progress: {
        status: (progress?.status ?? 'not_started') as LessonStatus,
        startedAt: progress?.startedAt?.toISOString() ?? null,
        completedAt: progress?.completedAt?.toISOString() ?? null,
        notes: progress?.notes ?? '',
        bookmarked: progress?.bookmarked ?? false,
      },
    };
  }

  /** Creates the progress row (idempotent). Returns true if this call created it. */
  private async ensureProgress(
    userId: string,
    lesson: { _id: string; courseId: string },
  ): Promise<boolean> {
    const uid = oid(userId);
    const now = new Date();
    let created = false;
    if (!(await LessonProgressModel.exists({ userId: uid, lessonId: lesson._id }))) {
      try {
        await LessonProgressModel.create({
          userId: uid,
          lessonId: lesson._id,
          courseId: lesson.courseId,
          status: 'in_progress',
          startedAt: now,
        });
        created = true;
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
      }
    }
    await EnrollmentModel.updateOne(
      { userId: uid, courseId: lesson.courseId },
      { $setOnInsert: { startedAt: now }, $set: { lastLessonId: lesson._id, lastActivityAt: now } },
      { upsert: true },
    ).catch((err: unknown) => {
      if (!isDuplicateKey(err)) throw err;
    });
    return created;
  }

  async startLesson(userId: string, lessonId: string): Promise<{ status: LessonStatus }> {
    const lesson = await this.liveLesson(lessonId);
    const created = await this.ensureProgress(userId, lesson);
    if (created) {
      await this.learning.recordActivity(
        userId,
        {
          type: 'lesson_started',
          refId: lesson._id,
          courseId: lesson.courseId,
          title: (lesson.title as LocalizedText).en,
        },
        { countsForStreak: false },
      );
    }
    const progress = await LessonProgressModel.findOne(
      { userId: oid(userId), lessonId },
      { status: 1 },
    ).lean();
    return { status: (progress?.status ?? 'in_progress') as LessonStatus };
  }

  async completeLesson(userId: string, lessonId: string): Promise<CompleteLessonResultDto> {
    const lesson = await this.liveLesson(lessonId);
    const uid = oid(userId);
    await this.ensureProgress(userId, lesson);

    const now = new Date();
    const firstCompletion = await LessonProgressModel.findOneAndUpdate(
      { userId: uid, lessonId, status: { $ne: 'completed' } },
      { $set: { status: 'completed', completedAt: now } },
      { returnDocument: 'after' },
    ).lean();

    let stats = null;
    let xpAwarded = 0;
    if (firstCompletion) {
      xpAwarded = XP.lessonCompleted;
      stats = await this.learning.recordActivity(userId, {
        type: 'lesson_completed',
        refId: lesson._id,
        courseId: lesson.courseId,
        title: (lesson.title as LocalizedText).en,
        topics: lesson.topics,
        xp: xpAwarded,
      });
    }
    stats ??= await this.learning.stats(userId);

    const [course, completedInCourse, progress, siblings] = await Promise.all([
      CourseModel.findOne({ _id: lesson.courseId }, { slug: 1, lessonCount: 1 }).lean(),
      LessonProgressModel.countDocuments({
        userId: uid,
        courseId: lesson.courseId,
        status: 'completed',
      }),
      LessonProgressModel.findOne({ userId: uid, lessonId }).lean(),
      LessonModel.find({ courseId: lesson.courseId, ...LIVE }, { slug: 1, title: 1, order: 1 })
        .sort({ order: 1 })
        .lean(),
    ]);
    const courseCompleted = Boolean(
      course && course.lessonCount > 0 && completedInCourse >= course.lessonCount,
    );
    if (courseCompleted) {
      await EnrollmentModel.updateOne(
        { userId: uid, courseId: lesson.courseId, completedAt: null },
        { $set: { completedAt: now } },
      );
    }
    const index = siblings.findIndex((s) => s._id === lesson._id);
    const nextLesson = siblings[index + 1];

    return {
      progress: {
        status: 'completed',
        startedAt: progress?.startedAt?.toISOString() ?? null,
        completedAt: progress?.completedAt?.toISOString() ?? null,
        notes: progress?.notes ?? '',
        bookmarked: progress?.bookmarked ?? false,
      },
      xpAwarded,
      stats,
      courseCompleted,
      next:
        nextLesson && course
          ? {
              id: nextLesson._id,
              slug: nextLesson.slug,
              courseSlug: course.slug,
              title: nextLesson.title as LocalizedText,
            }
          : null,
    };
  }

  async saveNotes(userId: string, lessonId: string, notes: string): Promise<{ notes: string }> {
    const lesson = await this.liveLesson(lessonId);
    await this.ensureProgress(userId, lesson);
    await LessonProgressModel.updateOne({ userId: oid(userId), lessonId }, { $set: { notes } });
    return { notes };
  }

  async setBookmark(
    userId: string,
    lessonId: string,
    bookmarked: boolean,
  ): Promise<{ bookmarked: boolean }> {
    const lesson = await this.liveLesson(lessonId);
    await this.ensureProgress(userId, lesson);
    await LessonProgressModel.updateOne(
      { userId: oid(userId), lessonId },
      { $set: { bookmarked } },
    );
    return { bookmarked };
  }

  async bookmarks(userId: string): Promise<(LessonRefDto & { summary: LocalizedText })[]> {
    const rows = await LessonProgressModel.find(
      { userId: oid(userId), bookmarked: true },
      { lessonId: 1 },
    )
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    const refs = await lessonRefs(rows.map((r) => r.lessonId));
    const summaries = await LessonModel.find(
      { _id: { $in: refs.map((r) => r.id) } },
      { summary: 1 },
    ).lean();
    const summaryById = new Map(summaries.map((s) => [s._id, s.summary as LocalizedText]));
    return refs.map((r) => ({ ...r, summary: summaryById.get(r.id) ?? r.title }));
  }

  async search(q: string): Promise<SearchResultDto> {
    const projection = { score: { $meta: 'textScore' } } as const;
    let [lessons, courses] = await Promise.all([
      LessonModel.find(
        { $text: { $search: q }, ...LIVE },
        { ...projection, slug: 1, title: 1, summary: 1, courseId: 1 },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(10)
        .lean(),
      CourseModel.find(
        { $text: { $search: q }, ...LIVE },
        { ...projection, slug: 1, title: 1, summary: 1 },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(5)
        .lean<CourseLean[]>(),
    ]);
    if (lessons.length === 0 && courses.length === 0) {
      // Fallback for partial words, which the text index does not match.
      const pattern = new RegExp(escapeRegex(q), 'i');
      [lessons, courses] = await Promise.all([
        LessonModel.find(
          { searchText: pattern, ...LIVE },
          { slug: 1, title: 1, summary: 1, courseId: 1 },
        )
          .limit(10)
          .lean(),
        CourseModel.find({ searchText: pattern, ...LIVE }, { slug: 1, title: 1, summary: 1 })
          .limit(5)
          .lean<CourseLean[]>(),
      ]);
    }
    const courseIds = [...new Set(lessons.map((l) => l.courseId))];
    const lessonCourses = await CourseModel.find(
      { _id: { $in: courseIds } },
      { slug: 1, title: 1 },
    ).lean<CourseLean[]>();
    const courseById = new Map(lessonCourses.map((c) => [c._id, c]));
    return {
      lessons: lessons.flatMap((l) => {
        const c = courseById.get(l.courseId);
        return c
          ? [
              {
                id: l._id,
                slug: l.slug,
                courseSlug: c.slug,
                title: l.title as LocalizedText,
                summary: l.summary as LocalizedText,
                courseTitle: c.title as LocalizedText,
              },
            ]
          : [];
      }),
      courses: courses.map((c) => ({
        id: c._id,
        slug: c.slug,
        title: c.title as LocalizedText,
        summary: c.summary as LocalizedText,
      })),
    };
  }
}
