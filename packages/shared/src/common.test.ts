import { describe, expect, it } from 'vitest';
import { contentIdSchema, emailSchema, localizedTextSchema, objectIdSchema } from './common';
import { CAREER_GOAL_TRACK, CAREER_GOALS } from './enums';

describe('common schemas', () => {
  it('normalizes emails and rejects invalid ones', () => {
    expect(emailSchema.parse('  Learner@Example.COM ')).toBe('learner@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse({ $gt: '' }).success).toBe(false);
  });

  it('accepts only kebab-case content ids', () => {
    expect(contentIdSchema.safeParse('llm-tokens-context').success).toBe(true);
    expect(contentIdSchema.safeParse('Bad_Id').success).toBe(false);
    expect(contentIdSchema.safeParse('double--hyphen').success).toBe(false);
  });

  it('validates object ids', () => {
    expect(objectIdSchema.safeParse('64b7f0c2a1b2c3d4e5f60718').success).toBe(true);
    expect(objectIdSchema.safeParse('64b7f0c2').success).toBe(false);
  });

  it('requires Hinglish and English for localized text, Hindi optional', () => {
    expect(localizedTextSchema.safeParse({ hinglish: 'Namaste', en: 'Hello' }).success).toBe(true);
    expect(localizedTextSchema.safeParse({ en: 'Hello' }).success).toBe(false);
  });

  it('maps every career goal to a track or general', () => {
    for (const goal of CAREER_GOALS) expect(goal in CAREER_GOAL_TRACK).toBe(true);
  });
});
