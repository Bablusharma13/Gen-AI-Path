import { describe, expect, it } from 'vitest';
import { normalizeAnswer, scoreAttempt, scoreQuestion } from './assessment';
import type { QuestionContent } from './content';

const t = (en: string) => ({ en, hinglish: en });

const single: QuestionContent = {
  id: 'q-single',
  type: 'single_choice',
  prompt: t('Pick one'),
  explanation: t('Because'),
  topics: ['embeddings'],
  points: 1,
  options: [
    { id: 'a', text: t('A') },
    { id: 'b', text: t('B') },
  ],
  correctOptionIds: ['b'],
};

const multi: QuestionContent = {
  id: 'q-multi',
  type: 'multiple_choice',
  prompt: t('Pick all'),
  explanation: t('Because'),
  topics: ['rag'],
  points: 2,
  options: [
    { id: 'a', text: t('A') },
    { id: 'b', text: t('B') },
    { id: 'c', text: t('C') },
  ],
  correctOptionIds: ['a', 'c'],
};

const short: QuestionContent = {
  id: 'q-short',
  type: 'short_text',
  prompt: t('Why RAG?'),
  explanation: t('Because'),
  topics: ['rag'],
  points: 2,
  sampleAnswer: t('Retrieves private documents at query time and grounds the answer.'),
  rubric: [
    {
      id: 'retrieval',
      idea: t('Retrieves relevant documents'),
      anyOf: ['retrieve', 'retrieval', 'search', 'dhoond'],
    },
    {
      id: 'grounding',
      idea: t('Grounds the answer in sources'),
      anyOf: ['ground', 'grounded', 'cite', 'source'],
    },
  ],
};

describe('scoreQuestion', () => {
  it('scores single choice exactly', () => {
    expect(
      scoreQuestion(single, { questionId: 'q-single', selectedOptionIds: ['b'] }).correct,
    ).toBe(true);
    expect(
      scoreQuestion(single, { questionId: 'q-single', selectedOptionIds: ['a'] }).pointsAwarded,
    ).toBe(0);
    expect(scoreQuestion(single, undefined).correct).toBe(false);
  });

  it('requires the exact set for multiple choice and flags partial answers', () => {
    const exact = scoreQuestion(multi, { questionId: 'q-multi', selectedOptionIds: ['c', 'a'] });
    expect(exact.correct).toBe(true);
    expect(exact.pointsAwarded).toBe(2);
    const partial = scoreQuestion(multi, { questionId: 'q-multi', selectedOptionIds: ['a'] });
    expect(partial.correct).toBe(false);
    expect(partial.partial).toBe(true);
    const extra = scoreQuestion(multi, {
      questionId: 'q-multi',
      selectedOptionIds: ['a', 'b', 'c'],
    });
    expect(extra.correct).toBe(false);
  });

  it('ignores option ids that do not exist', () => {
    const r = scoreQuestion(single, { questionId: 'q-single', selectedOptionIds: ['b', 'z'] });
    expect(r.correct).toBe(true);
    expect(r.selectedOptionIds).toEqual(['b']);
  });

  it('scores short answers by rubric ideas with partial credit and feedback', () => {
    const full = scoreQuestion(short, {
      questionId: 'q-short',
      text: 'It does Retrieval of company docs, then the answer is grounded with sources!',
    });
    expect(full.correct).toBe(true);
    expect(full.pointsAwarded).toBe(2);

    const half = scoreQuestion(short, {
      questionId: 'q-short',
      text: 'Pehle documents dhoond ke laata hai',
    });
    expect(half.correct).toBe(false);
    expect(half.partial).toBe(true);
    expect(half.pointsAwarded).toBe(1);
    expect(half.missingIdeas?.[0]?.en).toBe('Grounds the answer in sources');
  });

  it('matches whole words only, so substrings do not earn credit', () => {
    // "background" contains "ground" but must not satisfy the grounding idea.
    const r = scoreQuestion(short, { questionId: 'q-short', text: 'retrieval in the background' });
    expect(r.matchedIdeas).toHaveLength(1);
  });

  it('does not reward an empty or plausible-sounding but irrelevant answer', () => {
    const r = scoreQuestion(short, {
      questionId: 'q-short',
      text: 'RAG is a very powerful and modern AI technique used by experts.',
    });
    expect(r.pointsAwarded).toBe(0);
  });
});

describe('scoreAttempt', () => {
  it('computes totals and pass/fail', () => {
    const result = scoreAttempt(
      [single, multi, short],
      [
        { questionId: 'q-single', selectedOptionIds: ['b'] },
        { questionId: 'q-multi', selectedOptionIds: ['a', 'c'] },
        { questionId: 'q-short', text: 'search then cite' },
      ],
      70,
    );
    expect(result.maxScore).toBe(5);
    expect(result.score).toBe(5);
    expect(result.percent).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('treats unanswered questions as wrong', () => {
    const result = scoreAttempt([single, multi], [], 50);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('normalizeAnswer', () => {
  it('keeps Devanagari (including vowel signs) and strips punctuation', () => {
    expect(normalizeAnswer('  Embeddings, यानी   VECTORS!! ')).toBe('embeddings यानी vectors');
  });

  it('matches Hindi rubric phrases as whole words', () => {
    const hindi: QuestionContent = {
      ...short,
      id: 'q-hindi',
      rubric: [{ id: 'search', idea: t('Search'), anyOf: ['खोज'] }],
    };
    expect(scoreQuestion(hindi, { questionId: 'q-hindi', text: 'पहले खोज करते हैं' }).correct).toBe(
      true,
    );
    expect(scoreQuestion(hindi, { questionId: 'q-hindi', text: 'खोजना' }).correct).toBe(false);
  });
});
