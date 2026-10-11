import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadContent, resolveContentDir, type LoadedContent } from '../src/content/loader';
import { seedContent } from '../src/content/seed';
import { LessonModel } from '../src/db/models/curriculum.model';
import {
  createTestHarness,
  registerClient,
  STRONG_PASSWORD,
  TestClient,
  type TestHarness,
} from './helpers';

let h: TestHarness;
let content: LoadedContent;

beforeAll(async () => {
  h = await createTestHarness();
  content = await loadContent(resolveContentDir());
  await seedContent(content);
});

afterAll(async () => {
  await h.close();
});

const onboarding = {
  careerGoal: 'genai_app_engineer',
  level: 'beginner',
  experience: 'none',
  programmingLanguages: ['python'],
  primaryProgrammingLanguage: 'python',
  explanationLanguage: 'hinglish',
  learningStyle: 'beginner_friendly',
  dailyMinutes: 30,
};

describe('seeding', () => {
  it('is idempotent', async () => {
    const report = await seedContent(content);
    expect(report.lessons.created + report.lessons.updated).toBe(0);
    expect(report.lessons.unchanged).toBe(content.lessons.length);
  });

  it('archives content that disappeared instead of deleting it', async () => {
    const trimmed = { ...content, lessons: content.lessons.filter((l) => l.id !== 'py-http-apis') };
    const report = await seedContent(trimmed);
    expect(report.lessons.archived).toBe(1);
    expect(await LessonModel.exists({ _id: 'py-http-apis' })).toBeTruthy();
    await seedContent(content); // restore
  });
});

describe('catalog and lessons', () => {
  it('lists published courses in level order with zero progress', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/courses');
    expect(res.status).toBe(200);
    const levels = res.body.data.map((c: { level: number }) => c.level);
    expect(levels).toEqual([...levels].sort((a: number, b: number) => a - b));
    const py = res.body.data.find((c: { id: string }) => c.id === 'python-foundations');
    expect(py.lessonCount).toBe(6);
    expect(py.progress).toMatchObject({ completedLessons: 0, status: 'not_started' });
  });

  it('returns course detail with modules and lesson summaries by slug', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/courses/ai-foundations');
    expect(res.status).toBe(200);
    expect(res.body.data.modules.map((m: { id: string }) => m.id)).toEqual([
      'ai-big-picture',
      'ai-math-intuition',
    ]);
    const vectors = res.body.data.modules[1].lessons[0];
    expect(vectors).toMatchObject({
      id: 'ai-vectors-similarity',
      labId: 'embeddings',
      exerciseCount: 1,
      hasAssessment: true,
    });
    expect(res.body.data.prerequisiteCourses).toEqual([
      expect.objectContaining({ id: 'python-foundations', satisfied: false }),
    ]);
  });

  it('returns a full lesson with navigation and prerequisite status', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/courses/python-foundations/lessons/conditions-and-loops');
    expect(res.status).toBe(200);
    const lesson = res.body.data;
    expect(lesson.id).toBe('py-control-flow');
    expect(lesson.navigation.previous.id).toBe('py-variables-types');
    expect(lesson.navigation.next.id).toBe('py-collections');
    expect(lesson.prerequisites).toEqual([
      expect.objectContaining({ id: 'py-variables-types', completed: false }),
    ]);
    expect(lesson.sections.explanation.hinglish).toBeTruthy();
    expect(lesson.exercises[0]).toMatchObject({
      id: 'ex-py-classify-temperature',
      passed: false,
      attempts: 0,
    });
    expect(lesson.assessment).toMatchObject({ id: 'quiz-py-control-flow', bestPercent: null });
  });

  it('404s for unknown lessons and 400s for malformed ids', async () => {
    const { client } = await registerClient(h.app);
    expect((await client.get('/api/v1/lessons/does-not-exist')).status).toBe(404);
    expect((await client.get('/api/v1/lessons/Bad_ID')).status).toBe(400);
  });

  it('requires authentication', async () => {
    const anon = await TestClient.create(h.app);
    expect((await anon.get('/api/v1/courses')).status).toBe(401);
  });

  it('searches lessons and courses', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/search?q=cosine');
    expect(res.status).toBe(200);
    expect(res.body.data.lessons.map((l: { id: string }) => l.id)).toContain(
      'ai-vectors-similarity',
    );
    const partial = await client.get('/api/v1/search?q=gradie');
    expect(partial.body.data.lessons.map((l: { id: string }) => l.id)).toContain(
      'ai-gradient-descent',
    );
  });
});

describe('progress', () => {
  it('tracks start → complete, awards XP once and starts a streak', async () => {
    const { client } = await registerClient(h.app);
    const start = await client.post('/api/v1/lessons/py-variables-types/start');
    expect(start.body.data.status).toBe('in_progress');

    const done = await client.post('/api/v1/lessons/py-variables-types/complete');
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({
      xpAwarded: 20,
      stats: { xp: 20, currentStreak: 1, longestStreak: 1 },
      courseCompleted: false,
      next: expect.objectContaining({ id: 'py-control-flow' }),
    });

    const again = await client.post('/api/v1/lessons/py-variables-types/complete');
    expect(again.body.data.xpAwarded).toBe(0);
    expect(again.body.data.stats.xp).toBe(20);

    const course = await client.get('/api/v1/courses/python-foundations');
    expect(course.body.data.progress).toMatchObject({ completedLessons: 1, status: 'in_progress' });
  });

  it('persists progress, notes and bookmarks across sign-out and sign-in', async () => {
    const { client, email } = await registerClient(h.app);
    await client.post('/api/v1/lessons/py-collections/complete');
    await client.put('/api/v1/lessons/py-functions/notes', {
      notes: 'Remember: return, not print!',
    });
    await client.put('/api/v1/lessons/py-functions/bookmark', { bookmarked: true });
    await client.post('/api/v1/auth/logout');

    const again = await TestClient.create(h.app);
    await again.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
    const lesson = await again.get('/api/v1/lessons/py-functions');
    expect(lesson.body.data.progress).toMatchObject({
      notes: 'Remember: return, not print!',
      bookmarked: true,
    });
    const collections = await again.get('/api/v1/lessons/py-collections');
    expect(collections.body.data.progress.status).toBe('completed');
    const bookmarks = await again.get('/api/v1/bookmarks');
    expect(bookmarks.body.data.map((b: { id: string }) => b.id)).toEqual(['py-functions']);
  });

  it('never leaks one learner’s progress or notes to another', async () => {
    const a = await registerClient(h.app);
    const b = await registerClient(h.app);
    await a.client.put('/api/v1/lessons/py-functions/notes', { notes: 'A private note' });
    await a.client.post('/api/v1/lessons/py-functions/complete');
    const bLesson = await b.client.get('/api/v1/lessons/py-functions');
    expect(bLesson.body.data.progress).toMatchObject({ status: 'not_started', notes: '' });
    const bCourses = await b.client.get('/api/v1/courses');
    const py = bCourses.body.data.find((c: { id: string }) => c.id === 'python-foundations');
    expect(py.progress.completedLessons).toBe(0);
  });

  it('caps notes at 10,000 characters', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.put('/api/v1/lessons/py-functions/notes', {
      notes: 'x'.repeat(10_001),
    });
    expect(res.status).toBe(400);
  });
});

describe('assessments', () => {
  it('never sends answer keys to the learner', async () => {
    const { client } = await registerClient(h.app);
    const res = await client.get('/api/v1/assessments/quiz-py-variables-types');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    for (const secret of ['correctOptionIds', 'rubric', 'anyOf', 'sampleAnswer', 'explanation']) {
      expect(body).not.toContain(secret);
    }
    expect(res.body.data.questions[0].options.length).toBeGreaterThan(1);
  });

  it('scores on the server, explains results and awards XP only on the first pass', async () => {
    const { client } = await registerClient(h.app);
    const answers = {
      answers: [
        { questionId: 'type-of-temperature', selectedOptionIds: ['b'] },
        { questionId: 'int-conversion', selectedOptionIds: ['c'] },
        { questionId: 'falsy-values', selectedOptionIds: ['a', 'b', 'c'] },
        {
          questionId: 'why-fstring',
          text: 'They insert variable values into the text and stay readable.',
        },
      ],
    };
    const first = await client.post(
      '/api/v1/assessments/quiz-py-variables-types/attempts',
      answers,
    );
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ percent: 100, passed: true, xpAwarded: 30 });
    expect(first.body.data.results[0].correctOptionIds).toEqual(['b']);

    const second = await client.post(
      '/api/v1/assessments/quiz-py-variables-types/attempts',
      answers,
    );
    expect(second.body.data.xpAwarded).toBe(0);

    const wrong = await client.post('/api/v1/assessments/quiz-py-variables-types/attempts', {
      answers: [{ questionId: 'type-of-temperature', selectedOptionIds: ['a'] }],
    });
    expect(wrong.body.data.passed).toBe(false);

    const history = await client.get('/api/v1/assessments/quiz-py-variables-types/attempts');
    expect(history.body.data).toHaveLength(3);
    const list = await client.get('/api/v1/assessments');
    const item = list.body.data.find((a: { id: string }) => a.id === 'quiz-py-variables-types');
    expect(item).toMatchObject({ attempts: 3, bestPercent: 100, passed: true });
  });

  it('rejects unknown and duplicate question ids', async () => {
    const { client } = await registerClient(h.app);
    const unknown = await client.post('/api/v1/assessments/quiz-py-control-flow/attempts', {
      answers: [{ questionId: 'not-a-question', selectedOptionIds: ['a'] }],
    });
    expect(unknown.status).toBe(400);
    const dup = await client.post('/api/v1/assessments/quiz-py-control-flow/attempts', {
      answers: [
        { questionId: 'elif-order', selectedOptionIds: ['a'] },
        { questionId: 'elif-order', selectedOptionIds: ['b'] },
      ],
    });
    expect(dup.status).toBe(400);
  });
});

describe('exercises', () => {
  it('hides the solution until the learner has tried enough', async () => {
    const { client } = await registerClient(h.app);
    const ex = await client.get('/api/v1/exercises/ex-py-build-prompt');
    expect(ex.status).toBe(200);
    expect(JSON.stringify(ex.body)).not.toContain('def build_prompt(topic, max_words):\n    words');
    expect(ex.body.data).toMatchObject({ verification: 'client', solutionAvailable: false });

    expect((await client.get('/api/v1/exercises/ex-py-build-prompt/solution')).status).toBe(403);
    for (let i = 0; i < 3; i += 1) {
      const attempt = await client.post('/api/v1/exercises/ex-py-build-prompt/attempts', {
        passed: false,
        testsPassed: 1,
        testsTotal: 4,
      });
      expect(attempt.status).toBe(201);
    }
    const solution = await client.get('/api/v1/exercises/ex-py-build-prompt/solution');
    expect(solution.status).toBe(200);
    expect(solution.body.data.solution).toContain('def build_prompt');
  });

  it('validates self-reported results', async () => {
    const { client } = await registerClient(h.app);
    const inconsistent = await client.post('/api/v1/exercises/ex-py-build-prompt/attempts', {
      passed: true,
      testsPassed: 2,
      testsTotal: 4,
    });
    expect(inconsistent.status).toBe(400);
    const wrongTotal = await client.post('/api/v1/exercises/ex-py-build-prompt/attempts', {
      passed: true,
      testsPassed: 9,
      testsTotal: 9,
    });
    expect(wrongTotal.status).toBe(400);
    const pass = await client.post('/api/v1/exercises/ex-py-build-prompt/attempts', {
      passed: true,
      testsPassed: 4,
      testsTotal: 4,
    });
    expect(pass.body.data).toMatchObject({ xpAwarded: 15, solutionAvailable: true });
  });
});

describe('roadmap and dashboard', () => {
  it('builds a roadmap from onboarding and lets the learner mark courses as known', async () => {
    const { client } = await registerClient(h.app);
    await client.post('/api/v1/profile/onboarding', onboarding);
    const roadmap = await client.get('/api/v1/roadmap');
    expect(roadmap.status).toBe(200);
    expect(roadmap.body.data.track).toBe('A');
    const status = (id: string, data = roadmap.body.data) =>
      data.items.find((i: { courseId: string }) => i.courseId === id)?.status;
    expect(status('python-foundations')).toBe('recommended');
    expect(status('ai-foundations')).toBe('locked');

    const updated = await client.patch('/api/v1/roadmap/items/python-foundations', { known: true });
    expect(status('python-foundations', updated.body.data)).toBe('known');
    expect(status('ai-foundations', updated.body.data)).toBe('recommended');

    const reset = await client.post('/api/v1/roadmap/reset', { keepKnown: false });
    expect(status('python-foundations', reset.body.data)).toBe('recommended');
  });

  it('flags weak topics only after repeated, unrecovered misses — with evidence', async () => {
    const { client } = await registerClient(h.app);
    const wrong = { answers: [{ questionId: 'int-conversion', selectedOptionIds: ['a'] }] };
    await client.post('/api/v1/assessments/quiz-py-variables-types/attempts', wrong);
    let summary = await client.get('/api/v1/progress/summary');
    // A single miss never labels a topic weak.
    expect(summary.body.data.weakTopics.map((w: { topic: string }) => w.topic)).not.toContain(
      'data-types',
    );

    await client.post('/api/v1/assessments/quiz-py-variables-types/attempts', wrong);
    summary = await client.get('/api/v1/progress/summary');
    const weak = summary.body.data.weakTopics.find(
      (w: { topic: string }) => w.topic === 'data-types',
    );
    expect(weak).toBeTruthy();
    expect(weak.evidence).toMatch(/Missed \d+ of \d+ questions/);
    expect(weak.suggestedLessons.length).toBeGreaterThan(0);

    // Recovering clears the flag.
    await client.post('/api/v1/assessments/quiz-py-variables-types/attempts', {
      answers: [
        { questionId: 'type-of-temperature', selectedOptionIds: ['b'] },
        { questionId: 'int-conversion', selectedOptionIds: ['c'] },
        { questionId: 'falsy-values', selectedOptionIds: ['a', 'b', 'c'] },
      ],
    });
    summary = await client.get('/api/v1/progress/summary');
    expect(summary.body.data.weakTopics.map((w: { topic: string }) => w.topic)).not.toContain(
      'data-types',
    );
  });

  it('summarises continue-learning, totals and activity', async () => {
    const { client } = await registerClient(h.app);
    await client.post('/api/v1/profile/onboarding', onboarding);
    await client.post('/api/v1/lessons/py-variables-types/complete');
    await client.post('/api/v1/lessons/py-control-flow/start');
    const res = await client.get('/api/v1/progress/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      completedLessons: 1,
      continueLearning: expect.objectContaining({ id: 'py-control-flow', status: 'in_progress' }),
      stats: expect.objectContaining({ xp: 20, currentStreak: 1 }),
      today: expect.objectContaining({ lessonsCompleted: 1, minutesGoal: 30 }),
    });
    expect(res.body.data.recommendedLesson).toBeTruthy();
    expect(res.body.data.weeklyActivity).toHaveLength(7);
    expect(res.body.data.recentActivity[0].title).toBeTruthy();
  });
});
