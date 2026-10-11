import type { ExplanationLanguage } from '@genpath/shared';

const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;
/** Frequent Hindi function words as written in Roman script. */
const HINGLISH_MARKERS = new Set([
  'hai',
  'hain',
  'ka',
  'ki',
  'ke',
  'ko',
  'se',
  'mein',
  'aur',
  'ye',
  'yeh',
  'woh',
  'kya',
  'nahi',
  'nahin',
  'karte',
  'karta',
  'karo',
  'hota',
  'hoti',
  'jaise',
  'matlab',
  'agar',
  'toh',
  'bhi',
  'kaise',
  'sakte',
]);

export interface LanguageSignal {
  devanagariShare: number;
  hinglishMarkerShare: number;
  likely: ExplanationLanguage;
}

/**
 * Cheap, deterministic language heuristic for evaluation: script share plus Hinglish function
 * words. Code blocks and inline code are ignored. It flags likely violations; it is not a judge.
 */
export function detectLanguage(text: string): LanguageSignal {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const dev = prose.match(DEVANAGARI)?.length ?? 0;
  const lat = prose.match(LATIN)?.length ?? 0;
  const devanagariShare = dev + lat === 0 ? 0 : dev / (dev + lat);
  const words = prose.toLowerCase().match(/[a-z]+/g) ?? [];
  const markers = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
  const hinglishMarkerShare = words.length === 0 ? 0 : markers / words.length;
  const likely: ExplanationLanguage =
    devanagariShare > 0.3 ? 'hi' : hinglishMarkerShare >= 0.06 ? 'hinglish' : 'en';
  return { devanagariShare, hinglishMarkerShare, likely };
}

export function matchesExplanationLanguage(text: string, expected: ExplanationLanguage): boolean {
  return detectLanguage(text).likely === expected;
}
