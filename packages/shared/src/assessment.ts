import { z } from 'zod';
import { contentIdSchema, type LocalizedList, type LocalizedText } from './common';
import type { QuestionContent } from './content';

export const MAX_TEXT_ANSWER = 2000;

export const answerInputSchema = z.object({
  questionId: contentIdSchema,
  selectedOptionIds: z
    .array(z.string().regex(/^[a-f]$/))
    .max(6)
    .optional(),
  text: z.string().max(MAX_TEXT_ANSWER).optional(),
});
export type AnswerInput = z.infer<typeof answerInputSchema>;

export const attemptInputSchema = z.object({
  answers: z.array(answerInputSchema).max(50),
  startedAt: z.iso.datetime().optional(),
});
export type AttemptInput = z.infer<typeof attemptInputSchema>;

/** Question as sent to the learner — no answer keys. */
export interface PublicQuestionDto {
  id: string;
  type: QuestionContent['type'];
  prompt: LocalizedText;
  points: number;
  topics: string[];
  options?: { id: string; text: LocalizedText }[];
}

export interface AssessmentDto {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: LocalizedText;
  objectives: LocalizedList;
  passingPercent: number;
  questions: PublicQuestionDto[];
  attempts: { count: number; bestPercent: number | null; passed: boolean };
}

export interface AssessmentListItemDto {
  id: string;
  courseId: string;
  courseTitle: LocalizedText;
  lessonId: string | null;
  lessonSlug: string | null;
  courseSlug: string;
  title: LocalizedText;
  questionCount: number;
  passingPercent: number;
  attempts: number;
  bestPercent: number | null;
  passed: boolean;
  lastAttemptAt: string | null;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  partial: boolean;
  points: number;
  pointsAwarded: number;
  selectedOptionIds?: string[];
  correctOptionIds?: string[];
  text?: string;
  matchedIdeas?: LocalizedText[];
  missingIdeas?: LocalizedText[];
  explanation: LocalizedText;
  sampleAnswer?: LocalizedText;
  topics: string[];
}

export interface AttemptResultDto {
  id: string;
  assessmentId: string;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passingPercent: number;
  createdAt: string;
  results: QuestionResult[];
  xpAwarded: number;
}

/** Lowercases, removes punctuation and collapses whitespace, keeping letters in any script. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(normalizedText: string, phrase: string): boolean {
  const p = normalizeAnswer(phrase);
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \p{M} keeps combining marks (e.g. Devanagari vowel signs) inside words.
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escaped}($|[^\\p{L}\\p{M}\\p{N}])`, 'u').test(
    normalizedText,
  );
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  return sa.size === new Set(b).size && b.every((x) => sa.has(x));
}

/**
 * Deterministic, explainable scoring. Choice questions need the exact set of correct options.
 * Short answers are scored against rubric idea groups (any accepted phrase satisfies a group);
 * partial credit is proportional to the ideas found.
 */
export function scoreQuestion(
  question: QuestionContent,
  answer: AnswerInput | undefined,
): QuestionResult {
  const base = {
    questionId: question.id,
    points: question.points,
    explanation: question.explanation,
    topics: question.topics,
  };

  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    const selected = [...new Set(answer?.selectedOptionIds ?? [])].filter((id) =>
      question.options.some((o) => o.id === id),
    );
    const correct = sameSet(selected, question.correctOptionIds);
    const partial = !correct && selected.some((id) => question.correctOptionIds.includes(id));
    return {
      ...base,
      correct,
      partial,
      pointsAwarded: correct ? question.points : 0,
      selectedOptionIds: selected,
      correctOptionIds: question.correctOptionIds,
    };
  }

  const text = (answer?.text ?? '').slice(0, MAX_TEXT_ANSWER);
  const normalized = normalizeAnswer(text);
  const matched = question.rubric.filter((group) =>
    group.anyOf.some((p) => containsPhrase(normalized, p)),
  );
  const missing = question.rubric.filter((group) => !matched.includes(group));
  const required = Math.min(
    question.requiredGroups ?? question.rubric.length,
    question.rubric.length,
  );
  const ratio = Math.min(matched.length, required) / required;
  const correct = matched.length >= required;
  return {
    ...base,
    correct,
    partial: !correct && matched.length > 0,
    pointsAwarded: Math.round(question.points * ratio * 100) / 100,
    text,
    matchedIdeas: matched.map((g) => g.idea),
    missingIdeas: correct ? [] : missing.map((g) => g.idea),
    sampleAnswer: question.sampleAnswer,
  };
}

export function scoreAttempt(
  questions: QuestionContent[],
  answers: AnswerInput[],
  passingPercent: number,
): {
  results: QuestionResult[];
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
} {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const results = questions.map((q) => scoreQuestion(q, byId.get(q.id)));
  const score = Math.round(results.reduce((sum, r) => sum + r.pointsAwarded, 0) * 100) / 100;
  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
  const percent = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
  return { results, score, maxScore, percent, passed: percent >= passingPercent };
}
