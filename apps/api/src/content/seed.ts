import type { Model } from 'mongoose';
import {
  AssessmentModel,
  CourseModel,
  ExerciseModel,
  LessonModel,
} from '../db/models/curriculum.model';
import { InterviewQuestionModel } from '../db/models/career.model';
import { ProjectModel } from '../db/models/project.model';
import { contentHash, type LoadedContent } from './loader';

export interface SeedCounts {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
}

export interface SeedReport {
  courses: SeedCounts;
  lessons: SeedCounts;
  assessments: SeedCounts;
  exercises: SeedCounts;
  projects: SeedCounts;
  interviewQuestions: SeedCounts;
  warnings: string[];
}

interface SeedDoc {
  _id: string;
  version: number;
  [key: string]: unknown;
}

/**
 * Upserts documents by stable id. Unchanged documents (same hash) are not touched; documents no
 * longer present in content are archived (never deleted) so learner progress keeps its references.
 */
async function sync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each curriculum model has a different document type
  model: Model<any>,
  docs: SeedDoc[],
  label: string,
  warnings: string[],
): Promise<SeedCounts> {
  const counts: SeedCounts = { created: 0, updated: 0, unchanged: 0, archived: 0 };
  const existing = new Map<
    string,
    { contentHash: string; version: number; archivedAt: Date | null }
  >(
    (
      (await model.find({}, { contentHash: 1, version: 1, archivedAt: 1 }).lean()) as {
        _id: string;
        contentHash: string;
        version: number;
        archivedAt: Date | null;
      }[]
    ).map((d) => [d._id, d]),
  );

  const ops = [];
  for (const doc of docs) {
    const hash = contentHash(doc);
    const prev = existing.get(doc._id);
    if (prev && prev.contentHash === hash && !prev.archivedAt) {
      counts.unchanged += 1;
      continue;
    }
    if (prev && prev.contentHash !== hash && prev.version >= doc.version) {
      warnings.push(`${label} "${doc._id}" changed without a version bump (still v${doc.version})`);
    }
    if (prev) counts.updated += 1;
    else counts.created += 1;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { ...doc, contentHash: hash, archivedAt: null } },
        upsert: true,
      },
    });
  }

  const ids = new Set(docs.map((d) => d._id));
  const toArchive = [...existing.entries()]
    .filter(([id, d]) => !ids.has(id) && !d.archivedAt)
    .map(([id]) => id);
  if (toArchive.length > 0) {
    ops.push({
      updateMany: {
        filter: { _id: { $in: toArchive } },
        update: { $set: { archivedAt: new Date() } },
      },
    });
    counts.archived = toArchive.length;
  }
  if (ops.length > 0) await model.bulkWrite(ops, { ordered: false });
  return counts;
}

const joinText = (...parts: (string | string[] | undefined)[]) =>
  parts
    .flat()
    .filter((p): p is string => typeof p === 'string')
    .join(' ')
    .replace(/[#*`_>\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 5000);

export async function seedContent(content: LoadedContent): Promise<SeedReport> {
  const warnings = [...content.warnings];

  const courses = content.courses.map(({ id, ...rest }) => ({
    _id: id,
    ...rest,
    searchText: joinText(
      rest.title.en,
      rest.title.hinglish,
      rest.summary.en,
      rest.summary.hinglish,
    ),
  }));
  const lessons = content.lessons.map(({ id, ...rest }) => ({
    _id: id,
    ...rest,
    lab: rest.lab ?? null,
    assessmentId: rest.assessmentId ?? null,
    searchText: joinText(
      rest.title.en,
      rest.title.hinglish,
      rest.summary.en,
      rest.summary.hinglish,
      rest.objectives.en,
      rest.topics.map((t) => t.replaceAll('-', ' ')),
    ),
  }));
  const assessments = content.assessments.map(({ id, ...rest }) => ({
    _id: id,
    ...rest,
    lessonId: rest.lessonId ?? null,
  }));
  const exercises = content.exercises.map(({ id, ...rest }) => ({ _id: id, ...rest }));
  const projects = content.projects.map((p) => ({
    _id: p.id,
    version: p.version,
    status: p.status,
    order: p.order,
    level: p.level,
    tracks: p.tracks,
    lessonIds: p.lessonIds,
    content: p,
  }));
  const interviewQuestions = content.interviewQuestions.map(({ id, ...rest }, order) => ({
    _id: id,
    ...rest,
    followUps: rest.followUps ?? null,
    order,
  }));

  return {
    courses: await sync(CourseModel, courses, 'course', warnings),
    lessons: await sync(LessonModel, lessons, 'lesson', warnings),
    assessments: await sync(AssessmentModel, assessments, 'assessment', warnings),
    exercises: await sync(ExerciseModel, exercises, 'exercise', warnings),
    projects: await sync(ProjectModel, projects, 'project', warnings),
    interviewQuestions: await sync(
      InterviewQuestionModel,
      interviewQuestions,
      'interview question',
      warnings,
    ),
    warnings,
  };
}
