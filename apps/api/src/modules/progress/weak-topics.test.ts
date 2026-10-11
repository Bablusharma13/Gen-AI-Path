import { describe, expect, it } from 'vitest';
import { computeWeakTopics } from './progress.service';

const miss = (topics: string[]) => ({ correct: false, answered: true, topics });
const hit = (topics: string[]) => ({ correct: true, answered: true, topics });

describe('computeWeakTopics', () => {
  it('never flags a topic from a single attempt, even with several misses', () => {
    const weak = computeWeakTopics([
      { id: 'a1', results: [miss(['rag']), miss(['rag']), miss(['rag'])] },
    ]);
    expect(weak).toEqual([]);
  });

  it('flags repeated misses across attempts when the latest answer is still wrong', () => {
    const weak = computeWeakTopics([
      { id: 'a1', results: [miss(['rag']), hit(['tokens'])] },
      { id: 'a2', results: [miss(['rag'])] },
    ]);
    expect(weak).toHaveLength(1);
    expect(weak[0]).toMatchObject({ topic: 'rag', missed: 2, answered: 2, attempts: 2 });
    expect(weak[0]?.evidence).toContain('Missed 2 of 2 questions on “rag” across 2 attempts');
  });

  it('clears the flag once the learner answers correctly', () => {
    const weak = computeWeakTopics([
      { id: 'a1', results: [miss(['rag'])] },
      { id: 'a2', results: [miss(['rag'])] },
      { id: 'a3', results: [hit(['rag'])] },
    ]);
    expect(weak).toEqual([]);
  });

  it('ignores skipped questions', () => {
    const skipped = { correct: false, answered: false, topics: ['rag'] };
    const weak = computeWeakTopics([
      { id: 'a1', results: [skipped, skipped] },
      { id: 'a2', results: [skipped] },
    ]);
    expect(weak).toEqual([]);
  });

  it('orders by number of misses and caps the list', () => {
    const attempts = ['a', 'b', 'c', 'd', 'e', 'f'].map((topic, i) => ({
      id: `x${i}`,
      results: [miss([topic]), miss(['shared'])],
    }));
    const again = ['a', 'b', 'c', 'd', 'e', 'f'].map((topic, i) => ({
      id: `y${i}`,
      results: [miss([topic])],
    }));
    const weak = computeWeakTopics([...attempts, ...again]);
    expect(weak).toHaveLength(5);
    expect(weak[0]?.topic).toBe('shared');
  });
});
