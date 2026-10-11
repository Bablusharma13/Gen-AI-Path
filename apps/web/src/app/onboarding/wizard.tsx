'use client';

import {
  CAREER_GOAL_LABELS,
  CAREER_GOALS,
  DAILY_MINUTES,
  DAILY_MINUTES_LABELS,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  EXPLANATION_LANGUAGE_LABELS,
  EXPLANATION_LANGUAGES,
  LEARNING_STYLE_LABELS,
  LEARNING_STYLES,
  onboardingSchema,
  PROGRAMMING_LANGUAGE_LABELS,
  PROGRAMMING_LANGUAGES,
  SKILL_LEVEL_LABELS,
  SKILL_LEVELS,
  type CareerGoal,
  type DailyMinutes,
  type Experience,
  type ExplanationLanguage,
  type LearningStyle,
  type ProfileDto,
  type ProgrammingLanguage,
  type SkillLevel,
} from '@genpath/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckboxCards, RadioCards } from '@/components/ui/choice-group';
import { Alert, Progress, Skeleton, Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { meKey, profileKey, useMe } from '@/lib/auth';
import { PlacementStep } from './placement-step';

interface Draft {
  careerGoal: CareerGoal | null;
  level: SkillLevel | null;
  experience: Experience | null;
  programmingLanguages: ProgrammingLanguage[];
  primaryProgrammingLanguage: ProgrammingLanguage | null;
  explanationLanguage: ExplanationLanguage;
  learningStyle: LearningStyle;
  dailyMinutes: DailyMinutes | null;
  knownCourseIds: string[];
}

const INITIAL: Draft = {
  careerGoal: null,
  level: null,
  experience: null,
  programmingLanguages: ['python'],
  primaryProgrammingLanguage: 'python',
  explanationLanguage: 'hinglish',
  learningStyle: 'beginner_friendly',
  dailyMinutes: null,
  knownCourseIds: [],
};

interface Step {
  title: string;
  description: string;
  valid: (d: Draft) => boolean;
  render: (d: Draft, set: (patch: Partial<Draft>) => void) => ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'What do you want to become?',
    description:
      'Your goal decides which track your roadmap emphasises. You can change it any time.',
    valid: (d) => d.careerGoal !== null,
    render: (d, set) => (
      <RadioCards
        legend="Career goal"
        value={d.careerGoal}
        onChange={(careerGoal) => set({ careerGoal })}
        choices={CAREER_GOALS.map((goal) => ({
          value: goal,
          title: CAREER_GOAL_LABELS[goal].title,
          description: CAREER_GOAL_LABELS[goal].description,
        }))}
      />
    ),
  },
  {
    title: 'Where are you starting from?',
    description: 'Be honest — this only changes the pace and what we recommend first.',
    valid: (d) => d.level !== null && d.experience !== null,
    render: (d, set) => (
      <div className="space-y-6">
        <RadioCards
          legend="Current level in AI"
          columns={3}
          value={d.level}
          onChange={(level) => set({ level })}
          choices={SKILL_LEVELS.map((l) => ({ value: l, title: SKILL_LEVEL_LABELS[l] }))}
        />
        <RadioCards
          legend="Programming experience"
          value={d.experience}
          onChange={(experience) => set({ experience })}
          choices={EXPERIENCE_LEVELS.map((e) => ({ value: e, title: EXPERIENCE_LABELS[e] }))}
        />
      </div>
    ),
  },
  {
    title: 'Which programming languages?',
    description:
      'Code examples and exercises use your primary language. This is separate from the language we explain in.',
    valid: (d) =>
      d.programmingLanguages.length > 0 &&
      d.primaryProgrammingLanguage !== null &&
      d.programmingLanguages.includes(d.primaryProgrammingLanguage),
    render: (d, set) => (
      <div className="space-y-6">
        <CheckboxCards
          legend="Languages you want to use"
          values={d.programmingLanguages}
          onChange={(programmingLanguages) =>
            set({
              programmingLanguages,
              primaryProgrammingLanguage:
                d.primaryProgrammingLanguage &&
                programmingLanguages.includes(d.primaryProgrammingLanguage)
                  ? d.primaryProgrammingLanguage
                  : (programmingLanguages[0] ?? null),
            })
          }
          choices={PROGRAMMING_LANGUAGES.map((l) => ({
            value: l,
            title: PROGRAMMING_LANGUAGE_LABELS[l],
          }))}
        />
        {d.programmingLanguages.length > 1 ? (
          <RadioCards
            legend="Primary language"
            columns={3}
            value={d.primaryProgrammingLanguage}
            onChange={(primaryProgrammingLanguage) => set({ primaryProgrammingLanguage })}
            choices={d.programmingLanguages.map((l) => ({
              value: l,
              title: PROGRAMMING_LANGUAGE_LABELS[l],
            }))}
          />
        ) : null}
        <p className="text-sm text-muted-foreground">
          Python is used for ML foundations and Python exercises regardless — it is the language of
          the AI ecosystem.
        </p>
      </div>
    ),
  },
  {
    title: 'How should we explain things?',
    description: 'Explanation language and style apply to lessons and the AI Mentor.',
    valid: () => true,
    render: (d, set) => (
      <div className="space-y-6">
        <RadioCards
          legend="Explanation language"
          columns={3}
          value={d.explanationLanguage}
          onChange={(explanationLanguage) => set({ explanationLanguage })}
          choices={EXPLANATION_LANGUAGES.map((l) => ({
            value: l,
            title: EXPLANATION_LANGUAGE_LABELS[l].title,
            description: EXPLANATION_LANGUAGE_LABELS[l].sample,
          }))}
        />
        <RadioCards
          legend="Learning style"
          value={d.learningStyle}
          onChange={(learningStyle) => set({ learningStyle })}
          choices={LEARNING_STYLES.map((s) => ({
            value: s,
            title: LEARNING_STYLE_LABELS[s].title,
            description: LEARNING_STYLE_LABELS[s].description,
          }))}
        />
      </div>
    ),
  },
  {
    title: 'How much time per day?',
    description: 'We use this for your daily goal and to estimate when you finish each course.',
    valid: (d) => d.dailyMinutes !== null,
    render: (d, set) => (
      <RadioCards
        legend="Daily learning time"
        value={d.dailyMinutes}
        onChange={(dailyMinutes) => set({ dailyMinutes })}
        choices={DAILY_MINUTES.map((m) => ({ value: m, title: DAILY_MINUTES_LABELS[m] }))}
      />
    ),
  },
  {
    title: 'Skip what you already know',
    description:
      'Experienced? Mark courses you already understand. They are marked as known on your roadmap — you can still open them any time.',
    valid: () => true,
    render: (d, set) => (
      <PlacementStep
        selected={d.knownCourseIds}
        onChange={(knownCourseIds) => set({ knownCourseIds })}
      />
    ),
  },
];

export function OnboardingWizard() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL);

  useEffect(() => {
    if (me.data === null) router.replace('/login?next=/onboarding');
  }, [me.data, router]);

  const submit = useMutation({
    mutationFn: () => {
      const parsed = onboardingSchema.parse(draft);
      return api<ProfileDto>('/profile/onboarding', { method: 'POST', body: parsed });
    },
    onSuccess: async (profile) => {
      qc.setQueryData(profileKey, profile);
      await qc.invalidateQueries({ queryKey: meKey });
      router.replace('/path?welcome=1');
    },
  });

  if (!me.data) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Skeleton className="h-96" />
      </div>
    );
  }

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo href="/onboarding" />
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 sm:px-6">
        <div className="mb-6 space-y-2">
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length} · Namaste {me.data.name.split(' ')[0]} 👋
          </p>
          <Progress value={((step + 1) / STEPS.length) * 100} label="Onboarding progress" />
        </div>
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{current.title}</h1>
              <p className="text-sm text-muted-foreground">{current.description}</p>
            </div>
            {current.render(draft, set)}
            {submit.isError ? <Alert tone="error">{errorMessage(submit.error)}</Alert> : null}
            <div className="flex items-center justify-between border-t pt-4">
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
                <ArrowLeft aria-hidden /> Back
              </Button>
              {isLast ? (
                <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                  {submit.isPending ? <Spinner label="Saving" /> : <Check aria-hidden />}
                  Create my roadmap
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!current.valid(draft)}>
                  Next <ArrowRight aria-hidden />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
