import { describe, expect, it } from 'vitest';
import { pickList, pickText, pickVariant } from './localize';

const text = { hinglish: 'Namaste', en: 'Hello' };

describe('localization', () => {
  it('returns the requested explanation language', () => {
    expect(pickText(text, 'en')).toEqual({ value: 'Hello', fallback: false });
    expect(pickText(text, 'hinglish')).toEqual({ value: 'Namaste', fallback: false });
  });

  it('falls back to Hinglish for missing Hindi and says so', () => {
    expect(pickText(text, 'hi')).toEqual({ value: 'Namaste', fallback: true });
    expect(pickText({ ...text, hi: 'नमस्ते' }, 'hi')).toEqual({ value: 'नमस्ते', fallback: false });
    expect(pickList({ hinglish: ['a'], en: ['b'] }, 'hi').fallback).toBe(true);
  });
});

describe('pickVariant', () => {
  it('uses the preferred programming language when available', () => {
    expect(pickVariant({ python: 'x', typescript: 'y' }, 'typescript')).toEqual({
      language: 'typescript',
      fallback: false,
    });
  });

  it('flags a fallback instead of silently switching languages', () => {
    expect(pickVariant({ python: 'x' }, 'typescript')).toEqual({
      language: 'python',
      fallback: true,
    });
    expect(pickVariant({ python: 'x', javascript: 'j' }, 'typescript')).toEqual({
      language: 'javascript',
      fallback: true,
    });
  });

  it('returns null when there is no code at all', () => {
    expect(pickVariant({}, 'python')).toBeNull();
  });
});
