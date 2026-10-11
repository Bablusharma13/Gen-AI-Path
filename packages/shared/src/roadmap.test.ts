import { describe, expect, it } from 'vitest';
import { buildRoadmap, type RoadmapCourseInput, type RoadmapInput } from './roadmap';

const t = (en: string) => ({ en, hinglish: en });

const course = (
  id: string,
  level: number,
  extra: Partial<RoadmapCourseInput> = {},
): RoadmapCourseInput => ({
  id,
  slug: id,
  title: t(id),
  level,
  order: 0,
  tracks: ['A', 'B', 'C', 'D', 'E'],
  requiredForTracks: ['A'],
  prerequisites: [],
  likelyKnownBy: [],
  estimatedHours: 5,
  lessonCount: 4,
  ...extra,
});

const courses = [
  course('python', 1, { likelyKnownBy: ['python_development'] }),
  course('ai-foundations', 2, { prerequisites: ['python'] }),
  course('rag', 8, { prerequisites: ['ai-foundations'] }),
  course('fine-tuning', 12, {
    tracks: ['C'],
    requiredForTracks: ['C'],
    prerequisites: ['ai-foundations'],
  }),
];

const base: RoadmapInput = {
  careerGoal: 'genai_app_engineer',
  experience: 'none',
  dailyMinutes: 30,
  knownCourseIds: [],
  pinnedCourseIds: [],
  courses,
  progress: {},
};

const status = (r: ReturnType<typeof buildRoadmap>, id: string) =>
  r.items.find((i) => i.courseId === id)?.status;

describe('buildRoadmap', () => {
  it('recommends the first available course and locks courses with missing prerequisites', () => {
    const r = buildRoadmap(base);
    expect(r.track).toBe('A');
    expect(status(r, 'python')).toBe('recommended');
    expect(status(r, 'ai-foundations')).toBe('locked');
    expect(r.items.find((i) => i.courseId === 'ai-foundations')?.reasons.join(' ')).toMatch(
      /python/,
    );
  });

  it('marks track-irrelevant courses optional and never recommends them unasked', () => {
    const r = buildRoadmap({ ...base, knownCourseIds: ['python', 'ai-foundations'] });
    const ft = r.items.find((i) => i.courseId === 'fine-tuning');
    expect(ft?.relevance).toBe('optional');
    expect(ft?.status).toBe('available');
    expect(status(r, 'rag')).toBe('recommended');
  });

  it('lets known courses satisfy prerequisites (placement bypass)', () => {
    const r = buildRoadmap({ ...base, knownCourseIds: ['python'] });
    expect(status(r, 'python')).toBe('known');
    expect(status(r, 'ai-foundations')).toBe('recommended');
  });

  it('reflects progress: completed and in-progress courses', () => {
    const r = buildRoadmap({
      ...base,
      progress: {
        python: { completedLessons: 4, startedLessons: 4 },
        'ai-foundations': { completedLessons: 1, startedLessons: 2 },
      },
    });
    expect(status(r, 'python')).toBe('completed');
    expect(status(r, 'ai-foundations')).toBe('in_progress');
    expect(r.items.find((i) => i.courseId === 'ai-foundations')?.progressPercent).toBe(25);
    expect(r.summary.completedCourses).toBe(1);
  });

  it('suggests skimming for experienced learners without forcing a skip', () => {
    const r = buildRoadmap({ ...base, experience: 'python_development' });
    const py = r.items.find((i) => i.courseId === 'python');
    expect(py?.status).toBe('available');
    expect(py?.reasons.join(' ')).toMatch(/mark it as known/);
  });

  it('prioritises pinned courses for recommendation', () => {
    const r = buildRoadmap({
      ...base,
      knownCourseIds: ['python', 'ai-foundations'],
      pinnedCourseIds: ['fine-tuning'],
    });
    expect(status(r, 'fine-tuning')).toBe('recommended');
    expect(r.items.find((i) => i.courseId === 'fine-tuning')?.reasons).toContain('Pinned by you');
  });

  it('estimates days from the daily time budget', () => {
    const r = buildRoadmap({ ...base, dailyMinutes: 60 });
    expect(r.items.find((i) => i.courseId === 'python')?.estimatedDays).toBe(5);
    expect(r.summary.estimatedWeeks).toBeGreaterThan(0);
  });

  it('works for a general goal with no track', () => {
    const r = buildRoadmap({ ...base, careerGoal: 'general' });
    expect(r.track).toBeNull();
    expect(r.items.every((i) => i.relevance === 'recommended')).toBe(true);
  });
});
