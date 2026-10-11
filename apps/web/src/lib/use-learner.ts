'use client';

import {
  DEFAULT_PREFERENCES,
  type ExplanationLanguage,
  type ProgrammingLanguage,
} from '@genpath/shared';
import { useProfile } from './auth';

/** The learner's explanation and programming languages (defaults until the profile loads). */
export function useLearnerLanguages(): { lang: ExplanationLanguage; code: ProgrammingLanguage } {
  const profile = useProfile();
  return {
    lang: profile.data?.preferences.explanationLanguage ?? DEFAULT_PREFERENCES.explanationLanguage,
    code:
      profile.data?.preferences.primaryProgrammingLanguage ??
      DEFAULT_PREFERENCES.primaryProgrammingLanguage,
  };
}
