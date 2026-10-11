'use client';

import { EXPLANATION_LANGUAGES, type ExplanationLanguage } from '@genpath/shared';
import { Languages } from 'lucide-react';
import { useUpdatePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

const SHORT: Record<ExplanationLanguage, string> = {
  hinglish: 'Hinglish',
  en: 'English',
  hi: 'हिन्दी',
};

/**
 * Switches only the explanation language. Programming language is a separate preference and
 * is never touched here.
 */
export function LanguageSwitch({ value }: { value: ExplanationLanguage }) {
  const update = useUpdatePreferences();
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border bg-card p-1"
      role="radiogroup"
      aria-label="Explanation language"
    >
      <Languages className="ml-1 size-4 text-muted-foreground" aria-hidden />
      {EXPLANATION_LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          disabled={update.isPending}
          onClick={() => value !== l && update.mutate({ explanationLanguage: l })}
          className={cn(
            'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === l
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
