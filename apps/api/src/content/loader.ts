import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assessmentContentSchema,
  courseContentSchema,
  exerciseContentSchema,
  interviewBankSchema,
  lessonContentSchema,
  projectContentSchema,
  type AssessmentContent,
  type CourseContent,
  type ExerciseContent,
  type InterviewQuestionContent,
  type LessonContent,
  type ProjectContent,
} from '@genpath/shared';
import { parse } from 'yaml';
import type { z } from 'zod';

export interface LoadedLesson extends LessonContent {
  courseId: string;
  moduleId: string;
  order: number;
}

export interface LoadedCourse extends CourseContent {
  lessonCount: number;
}

export interface LoadedContent {
  courses: LoadedCourse[];
  lessons: LoadedLesson[];
  assessments: AssessmentContent[];
  exercises: ExerciseContent[];
  projects: ProjectContent[];
  interviewQuestions: InterviewQuestionContent[];
  warnings: string[];
}

export class ContentValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Content validation failed with ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'ContentValidationError';
  }
}

/** Finds `<repo>/content` by walking up to the pnpm workspace root, unless configured. */
export function resolveContentDir(configured?: string): string {
  if (configured) return path.resolve(configured);
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return path.join(dir, 'content');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve('content');
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function yamlFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

async function parseFile<S extends z.ZodType>(
  file: string,
  schema: S,
  root: string,
  problems: string[],
): Promise<z.output<S> | null> {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  let raw: unknown;
  try {
    raw = parse(await readFile(file, 'utf8'));
  } catch (err) {
    problems.push(`${rel}: invalid YAML — ${(err as Error).message.split('\n')[0]}`);
    return null;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      problems.push(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    return null;
  }
  return result.data;
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null;
    if (state.get(node) === 'visiting') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Loads and validates every content file, then cross-checks references between them.
 * Throws ContentValidationError listing every problem found (not just the first).
 */
export async function loadContent(contentDir: string): Promise<LoadedContent> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const curriculumDir = path.join(contentDir, 'curriculum');
  if (!existsSync(curriculumDir)) {
    throw new ContentValidationError([`Missing directory ${curriculumDir}`]);
  }

  const courses: LoadedCourse[] = [];
  const lessons: LoadedLesson[] = [];
  const assessments: AssessmentContent[] = [];
  const exercises: ExerciseContent[] = [];
  const projects: ProjectContent[] = [];
  const seenIds = new Map<string, string>();

  const claimId = (kind: string, id: string, where: string) => {
    const key = `${kind}:${id}`;
    const existing = seenIds.get(key);
    if (existing) problems.push(`${where}: duplicate ${kind} id "${id}" (also in ${existing})`);
    else seenIds.set(key, where);
  };

  const courseDirs = (await readdir(curriculumDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => path.join(curriculumDir, e.name))
    .sort();

  for (const courseDir of courseDirs) {
    const courseFile = path.join(courseDir, 'course.yaml');
    const rel = path.relative(contentDir, courseDir).replaceAll('\\', '/');
    if (!existsSync(courseFile)) {
      problems.push(`${rel}: missing course.yaml`);
      continue;
    }
    const course = await parseFile(courseFile, courseContentSchema, contentDir, problems);
    if (!course) continue;
    claimId('course', course.id, rel);

    const courseLessons = new Map<string, LessonContent>();
    for (const file of await yamlFiles(path.join(courseDir, 'lessons'))) {
      const lesson = await parseFile(file, lessonContentSchema, contentDir, problems);
      if (!lesson) continue;
      claimId('lesson', lesson.id, path.relative(contentDir, file));
      courseLessons.set(lesson.id, lesson);
    }

    let order = 0;
    const placed = new Set<string>();
    for (const mod of course.modules) {
      for (const lessonId of mod.lessonIds) {
        const lesson = courseLessons.get(lessonId);
        if (!lesson) {
          problems.push(
            `${rel}/course.yaml: module "${mod.id}" references unknown lesson "${lessonId}"`,
          );
          continue;
        }
        if (placed.has(lessonId)) {
          problems.push(`${rel}/course.yaml: lesson "${lessonId}" appears in more than one module`);
          continue;
        }
        placed.add(lessonId);
        lessons.push({ ...lesson, courseId: course.id, moduleId: mod.id, order: order++ });
      }
    }
    for (const lessonId of courseLessons.keys()) {
      if (!placed.has(lessonId))
        problems.push(`${rel}: lesson "${lessonId}" is not listed in any module`);
    }
    const publishedCount = [...placed].filter(
      (id) => courseLessons.get(id)?.status === 'published',
    ).length;
    courses.push({ ...course, lessonCount: publishedCount });

    for (const file of await yamlFiles(path.join(courseDir, 'assessments'))) {
      const assessment = await parseFile(file, assessmentContentSchema, contentDir, problems);
      if (!assessment) continue;
      claimId('assessment', assessment.id, path.relative(contentDir, file));
      if (assessment.courseId !== course.id) {
        problems.push(`${path.relative(contentDir, file)}: courseId must be "${course.id}"`);
      }
      assessments.push(assessment);
    }

    for (const file of await yamlFiles(path.join(courseDir, 'exercises'))) {
      const exercise = await parseFile(file, exerciseContentSchema, contentDir, problems);
      if (!exercise) continue;
      claimId('exercise', exercise.id, path.relative(contentDir, file));
      exercises.push(exercise);
    }
  }

  for (const file of await yamlFiles(path.join(contentDir, 'projects'))) {
    const project = await parseFile(file, projectContentSchema, contentDir, problems);
    if (!project) continue;
    claimId('project', project.id, path.relative(contentDir, file));
    projects.push(project);
  }

  const interviewQuestions: InterviewQuestionContent[] = [];
  const bankFile = path.join(contentDir, 'career', 'interview-questions.yaml');
  if (existsSync(bankFile)) {
    const bank = await parseFile(bankFile, interviewBankSchema, contentDir, problems);
    for (const q of bank?.questions ?? []) {
      claimId('interview question', q.id, 'career/interview-questions.yaml');
      interviewQuestions.push(q);
    }
  }

  // ── Cross-references ────────────────────────────────────────────────────────
  const courseIds = new Set(courses.map((c) => c.id));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const projectIds = new Set(projects.map((p) => p.id));
  const slugsByCourse = new Map<string, Set<string>>();
  const courseSlugs = new Set<string>();

  for (const course of courses) {
    if (courseSlugs.has(course.slug))
      problems.push(`course "${course.id}": duplicate slug "${course.slug}"`);
    courseSlugs.add(course.slug);
    for (const prereq of course.prerequisites) {
      if (!courseIds.has(prereq))
        problems.push(`course "${course.id}": unknown prerequisite course "${prereq}"`);
    }
  }

  for (const lesson of lessons) {
    const where = `lesson "${lesson.id}"`;
    const slugs = slugsByCourse.get(lesson.courseId) ?? new Set<string>();
    if (slugs.has(lesson.slug))
      problems.push(`${where}: duplicate slug "${lesson.slug}" in its course`);
    slugs.add(lesson.slug);
    slugsByCourse.set(lesson.courseId, slugs);

    for (const id of lesson.prerequisites) {
      if (!lessonById.has(id)) problems.push(`${where}: unknown prerequisite lesson "${id}"`);
    }
    for (const id of lesson.relatedLessonIds) {
      if (!lessonById.has(id)) problems.push(`${where}: unknown related lesson "${id}"`);
    }
    if (lesson.assessmentId) {
      const a = assessmentById.get(lesson.assessmentId);
      if (!a) problems.push(`${where}: unknown assessment "${lesson.assessmentId}"`);
      else if (a.lessonId && a.lessonId !== lesson.id) {
        problems.push(`${where}: assessment "${a.id}" belongs to lesson "${a.lessonId}"`);
      }
    }
    for (const id of lesson.exerciseIds) {
      const e = exerciseById.get(id);
      if (!e) problems.push(`${where}: unknown exercise "${id}"`);
      else if (e.lessonId !== lesson.id)
        problems.push(`${where}: exercise "${id}" belongs to lesson "${e.lessonId}"`);
    }
    for (const id of lesson.projectIds) {
      if (!projectIds.has(id)) problems.push(`${where}: unknown project "${id}"`);
    }
    if (lesson.status === 'published') {
      for (const id of lesson.prerequisites) {
        if (lessonById.get(id)?.status === 'draft')
          warnings.push(`${where}: published but prerequisite "${id}" is draft`);
      }
    }
  }

  for (const assessment of assessments) {
    const where = `assessment "${assessment.id}"`;
    if (assessment.lessonId && !lessonById.has(assessment.lessonId)) {
      problems.push(`${where}: unknown lesson "${assessment.lessonId}"`);
    }
    const questionIds = new Set<string>();
    for (const q of assessment.questions) {
      if (questionIds.has(q.id)) problems.push(`${where}: duplicate question id "${q.id}"`);
      questionIds.add(q.id);
      if (q.type === 'short_text') {
        if (q.requiredGroups && q.requiredGroups > q.rubric.length) {
          problems.push(`${where}/${q.id}: requiredGroups exceeds rubric size`);
        }
        continue;
      }
      const optionIds = q.options.map((o) => o.id);
      if (new Set(optionIds).size !== optionIds.length)
        problems.push(`${where}/${q.id}: duplicate option ids`);
      for (const id of q.correctOptionIds) {
        if (!optionIds.includes(id))
          problems.push(`${where}/${q.id}: correct option "${id}" does not exist`);
      }
    }
  }

  for (const exercise of exercises) {
    if (!lessonById.has(exercise.lessonId)) {
      problems.push(`exercise "${exercise.id}": unknown lesson "${exercise.lessonId}"`);
    }
  }

  for (const project of projects) {
    for (const id of project.lessonIds) {
      if (!lessonById.has(id)) problems.push(`project "${project.id}": unknown lesson "${id}"`);
    }
  }

  for (const q of interviewQuestions) {
    for (const id of q.relatedLessonIds) {
      if (!lessonById.has(id))
        problems.push(`interview question "${q.id}": unknown lesson "${id}"`);
    }
  }

  const courseCycle = findCycle(new Map(courses.map((c) => [c.id, c.prerequisites])));
  if (courseCycle) problems.push(`course prerequisite cycle: ${courseCycle.join(' → ')}`);
  const lessonCycle = findCycle(new Map(lessons.map((l) => [l.id, l.prerequisites])));
  if (lessonCycle) problems.push(`lesson prerequisite cycle: ${lessonCycle.join(' → ')}`);

  if (problems.length > 0) throw new ContentValidationError(problems);
  return { courses, lessons, assessments, exercises, projects, interviewQuestions, warnings };
}
