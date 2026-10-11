import type {
  ExplanationLanguage,
  LocalizedList,
  LocalizedText,
  ProgrammingLanguage,
} from '@genpath/shared';

export interface Picked<T> {
  value: T;
  /** True when the requested language was missing and Hinglish was shown instead. */
  fallback: boolean;
}

/** Picks the learner's explanation language; Hindi falls back to Hinglish when not yet written. */
export function pickText(text: LocalizedText, lang: ExplanationLanguage): Picked<string> {
  if (lang === 'hi')
    return text.hi ? { value: text.hi, fallback: false } : { value: text.hinglish, fallback: true };
  return { value: text[lang], fallback: false };
}

export function pickList(list: LocalizedList, lang: ExplanationLanguage): Picked<string[]> {
  if (lang === 'hi')
    return list.hi ? { value: list.hi, fallback: false } : { value: list.hinglish, fallback: true };
  return { value: list[lang], fallback: false };
}

/** Short form for titles where a fallback notice would be noise. */
export function tx(text: LocalizedText, lang: ExplanationLanguage): string {
  return pickText(text, lang).value;
}

export const CODE_LANGUAGE_ORDER: ProgrammingLanguage[] = ['python', 'typescript', 'javascript'];

/**
 * Chooses which code variant to show. Never silently switches the learner's programming language:
 * when their language is unavailable the caller gets `fallback: true` to display a notice.
 */
export function pickVariant(
  variants: Partial<Record<ProgrammingLanguage, string>>,
  preferred: ProgrammingLanguage,
): { language: ProgrammingLanguage; fallback: boolean } | null {
  if (variants[preferred]) return { language: preferred, fallback: false };
  // TypeScript and JavaScript are close cousins: prefer the other one before Python.
  const cousin: ProgrammingLanguage | null =
    preferred === 'typescript' ? 'javascript' : preferred === 'javascript' ? 'typescript' : null;
  if (cousin && variants[cousin]) return { language: cousin, fallback: true };
  const first = CODE_LANGUAGE_ORDER.find((l) => variants[l]);
  return first ? { language: first, fallback: true } : null;
}
