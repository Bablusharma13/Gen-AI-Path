'use client';

import {
  DAILY_MINUTES,
  DAILY_MINUTES_LABELS,
  EXPLANATION_LANGUAGE_LABELS,
  EXPLANATION_LANGUAGES,
  LEARNING_STYLE_LABELS,
  LEARNING_STYLES,
  PROGRAMMING_LANGUAGE_LABELS,
  PROGRAMMING_LANGUAGES,
  type ProfileDto,
} from '@genpath/shared';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxCards, RadioCards } from '@/components/ui/choice-group';
import { useUpdatePreferences } from '@/lib/preferences';

export function LearningSettings({ profile }: { profile: ProfileDto }) {
  const update = useUpdatePreferences();
  const p = profile.preferences;
  const save = (input: Parameters<typeof update.mutate>[0], message: string) =>
    update.mutate(input, { onSuccess: () => toast.success(message) });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Explanation language</CardTitle>
          <CardDescription>
            Used for lessons and the AI Mentor. Code stays in your programming language.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioCards
            legend="Explain in"
            columns={3}
            value={p.explanationLanguage}
            onChange={(explanationLanguage) =>
              save({ explanationLanguage }, 'Explanation language updated')
            }
            choices={EXPLANATION_LANGUAGES.map((l) => ({
              value: l,
              title: EXPLANATION_LANGUAGE_LABELS[l].title,
              description: EXPLANATION_LANGUAGE_LABELS[l].sample,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programming languages</CardTitle>
          <CardDescription>
            Code examples use your primary language when a lesson provides it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <CheckboxCards
            legend="Languages"
            values={p.programmingLanguages}
            onChange={(programmingLanguages) => {
              if (programmingLanguages.length === 0) {
                toast.error('Keep at least one programming language');
                return;
              }
              const primary = programmingLanguages.includes(p.primaryProgrammingLanguage)
                ? p.primaryProgrammingLanguage
                : programmingLanguages[0]!;
              save(
                { programmingLanguages, primaryProgrammingLanguage: primary },
                'Programming languages updated',
              );
            }}
            choices={PROGRAMMING_LANGUAGES.map((l) => ({
              value: l,
              title: PROGRAMMING_LANGUAGE_LABELS[l],
            }))}
          />
          <RadioCards
            legend="Primary language"
            columns={3}
            value={p.primaryProgrammingLanguage}
            onChange={(primaryProgrammingLanguage) =>
              save({ primaryProgrammingLanguage }, 'Primary language updated')
            }
            choices={p.programmingLanguages.map((l) => ({
              value: l,
              title: PROGRAMMING_LANGUAGE_LABELS[l],
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Learning style and pace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioCards
            legend="Learning style"
            value={p.learningStyle}
            onChange={(learningStyle) => save({ learningStyle }, 'Learning style updated')}
            choices={LEARNING_STYLES.map((s) => ({
              value: s,
              title: LEARNING_STYLE_LABELS[s].title,
              description: LEARNING_STYLE_LABELS[s].description,
            }))}
          />
          <RadioCards
            legend="Daily goal"
            columns={2}
            value={p.dailyMinutes}
            onChange={(dailyMinutes) => save({ dailyMinutes }, 'Daily goal updated')}
            choices={DAILY_MINUTES.map((m) => ({ value: m, title: DAILY_MINUTES_LABELS[m] }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
