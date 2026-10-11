import type { LocalizedList, LocalizedText } from '@genpath/shared';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ExerciseModel, LIVE } from '../../db/models/curriculum.model';
import { ExerciseAttemptModel } from '../../db/models/progress.model';
import { AppError, notFound } from '../../lib/errors';
import { XP, type LearningService } from '../learning/learning.service';

const oid = (id: string) => new Types.ObjectId(id);

/** Attempts needed before the reference solution unlocks (unless the learner already passed). */
export const SOLUTION_UNLOCK_ATTEMPTS = 3;

export const exerciseAttemptSchema = z
  .object({
    passed: z.boolean(),
    testsPassed: z.number().int().min(0).max(20),
    testsTotal: z.number().int().min(1).max(20),
    hintsUsed: z.number().int().min(0).max(20).default(0),
  })
  .refine((v) => v.testsPassed <= v.testsTotal, 'testsPassed cannot exceed testsTotal')
  .refine((v) => !v.passed || v.testsPassed === v.testsTotal, 'A passing run must pass every test');

export interface ExerciseDto {
  id: string;
  lessonId: string;
  language: 'python';
  title: LocalizedText;
  prompt: LocalizedText;
  starterCode: string;
  tests: { id: string; name: string; code: string }[];
  hints: LocalizedList;
  topics: string[];
  attempts: { count: number; passed: boolean };
  solutionAvailable: boolean;
  verification: 'client';
}

export class ExerciseService {
  constructor(private readonly learning: LearningService) {}

  private async stats(userId: string, exerciseId: string) {
    const [count, passed] = await Promise.all([
      ExerciseAttemptModel.countDocuments({ userId: oid(userId), exerciseId }),
      ExerciseAttemptModel.exists({ userId: oid(userId), exerciseId, passed: true }),
    ]);
    return { count, passed: Boolean(passed) };
  }

  private async live(exerciseId: string) {
    const exercise = await ExerciseModel.findOne({ _id: exerciseId, ...LIVE }).lean();
    if (!exercise) throw notFound('Exercise');
    return exercise;
  }

  async get(exerciseId: string, userId: string): Promise<ExerciseDto> {
    const e = await this.live(exerciseId);
    const attempts = await this.stats(userId, exerciseId);
    return {
      id: e._id,
      lessonId: e.lessonId,
      language: 'python',
      title: e.title as LocalizedText,
      prompt: e.prompt as LocalizedText,
      starterCode: e.starterCode,
      tests: e.tests as ExerciseDto['tests'],
      hints: e.hints as LocalizedList,
      topics: e.topics,
      attempts,
      solutionAvailable: attempts.passed || attempts.count >= SOLUTION_UNLOCK_ATTEMPTS,
      verification: 'client',
    };
  }

  /**
   * Records a run reported by the learner's browser. These results are self-reported (the code
   * ran client-side) and are used for progress only — never for formal grading.
   */
  async recordAttempt(
    userId: string,
    exerciseId: string,
    input: z.output<typeof exerciseAttemptSchema>,
  ) {
    const e = await this.live(exerciseId);
    if (input.testsTotal !== (e.tests as unknown[]).length) {
      throw new AppError('VALIDATION_ERROR', 'testsTotal does not match this exercise');
    }
    const alreadyPassed = Boolean(
      await ExerciseAttemptModel.exists({ userId: oid(userId), exerciseId, passed: true }),
    );
    await ExerciseAttemptModel.create({
      userId: oid(userId),
      exerciseId,
      lessonId: e.lessonId,
      ...input,
    });

    const xpAwarded = input.passed && !alreadyPassed ? XP.exercisePassed : 0;
    await this.learning.recordActivity(userId, {
      type: 'exercise_attempted',
      refId: e._id,
      title: `${(e.title as LocalizedText).en} — ${input.testsPassed}/${input.testsTotal} tests`,
      topics: input.passed ? [] : e.topics,
      xp: xpAwarded,
    });
    const attempts = await this.stats(userId, exerciseId);
    return {
      attempts,
      xpAwarded,
      solutionAvailable: attempts.passed || attempts.count >= SOLUTION_UNLOCK_ATTEMPTS,
    };
  }

  async solution(userId: string, exerciseId: string): Promise<{ solution: string }> {
    await this.live(exerciseId);
    const attempts = await this.stats(userId, exerciseId);
    if (!attempts.passed && attempts.count < SOLUTION_UNLOCK_ATTEMPTS) {
      throw new AppError(
        'FORBIDDEN',
        `Try at least ${SOLUTION_UNLOCK_ATTEMPTS} times (or pass the tests) before viewing the solution. Hints are available.`,
      );
    }
    const e = await ExerciseModel.findById(exerciseId).select('+solution').lean();
    return { solution: e?.solution ?? '' };
  }
}
