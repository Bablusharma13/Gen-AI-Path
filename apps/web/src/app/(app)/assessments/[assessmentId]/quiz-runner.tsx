'use client';

import type {
  AnswerInput,
  AssessmentDto,
  AttemptResultDto,
  ExplanationLanguage,
  PublicQuestionDto,
  QuestionResult,
} from '@genpath/shared';
import { ArrowLeft, CheckCircle2, CircleAlert, RotateCcw, Trophy, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { useAssessment, useSubmitAttempt } from '@/lib/curriculum';
import { pickList, tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';
import { cn } from '@/lib/utils';

type Answers = Record<string, { selected: string[]; text: string }>;

function QuestionInput({
  question,
  index,
  value,
  onChange,
  lang,
}: {
  question: PublicQuestionDto;
  index: number;
  value: { selected: string[]; text: string };
  onChange: (next: { selected: string[]; text: string }) => void;
  lang: ExplanationLanguage;
}) {
  const name = useId();
  const multiple = question.type === 'multiple_choice';
  return (
    <fieldset className="space-y-3">
      <legend className="w-full">
        <span className="text-xs font-medium text-muted-foreground">
          Question {index + 1} · {question.points} point{question.points === 1 ? '' : 's'}
          {multiple ? ' · select all that apply' : ''}
        </span>
        <Markdown className="mt-1 font-medium">{tx(question.prompt, lang)}</Markdown>
      </legend>
      {question.type === 'short_text' ? (
        <>
          <Textarea
            aria-label={`Answer to question ${index + 1}`}
            value={value.text}
            maxLength={2000}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder="Answer in your own words — English, Hinglish or Hindi all work."
          />
          <p className="text-xs text-muted-foreground">
            Scored against the key ideas in a published rubric, not by an AI judge.
          </p>
        </>
      ) : (
        <div className="grid gap-2">
          {question.options?.map((option) => {
            const checked = value.selected.includes(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors',
                  checked ? 'border-primary bg-primary/5' : 'hover:bg-accent/40',
                )}
              >
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={name}
                  className="mt-0.5 accent-[var(--color-primary)]"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      ...value,
                      selected: multiple
                        ? checked
                          ? value.selected.filter((id) => id !== option.id)
                          : [...value.selected, option.id]
                        : [option.id],
                    })
                  }
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {option.id.toUpperCase()}
                </span>
                <Markdown className="[&_p]:m-0">{tx(option.text, lang)}</Markdown>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function ResultCard({
  question,
  result,
  index,
  lang,
}: {
  question: PublicQuestionDto;
  result: QuestionResult;
  index: number;
  lang: ExplanationLanguage;
}) {
  const icon = result.correct ? (
    <CheckCircle2 className="size-5 text-success" aria-label="Correct" />
  ) : result.partial ? (
    <CircleAlert className="size-5 text-warning" aria-label="Partly correct" />
  ) : (
    <XCircle className="size-5 text-destructive" aria-label="Incorrect" />
  );
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              Question {index + 1} · {result.pointsAwarded}/{result.points} points
            </p>
            <Markdown className="font-medium">{tx(question.prompt, lang)}</Markdown>
          </div>
        </div>
        {question.options ? (
          <ul className="grid gap-1.5 text-sm">
            {question.options.map((o) => {
              const chosen = result.selectedOptionIds?.includes(o.id);
              const correct = result.correctOptionIds?.includes(o.id);
              return (
                <li
                  key={o.id}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-2',
                    correct && 'border-success/50 bg-success/5',
                    chosen && !correct && 'border-destructive/40 bg-destructive/5',
                  )}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {o.id.toUpperCase()}
                  </span>
                  <Markdown className="flex-1 [&_p]:m-0">{tx(o.text, lang)}</Markdown>
                  {correct ? <Badge variant="success">Correct answer</Badge> : null}
                  {chosen && !correct ? <Badge variant="destructive">Your choice</Badge> : null}
                  {chosen && correct ? <Badge variant="secondary">Your choice</Badge> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Your answer</p>
              <p className="whitespace-pre-wrap">{result.text || <em>(no answer)</em>}</p>
            </div>
            {result.matchedIdeas && result.matchedIdeas.length > 0 ? (
              <p>
                <span className="font-medium text-success">Ideas you covered: </span>
                {result.matchedIdeas.map((i) => tx(i, lang)).join('; ')}
              </p>
            ) : null}
            {result.missingIdeas && result.missingIdeas.length > 0 ? (
              <p>
                <span className="font-medium text-warning-foreground dark:text-warning">
                  Missing ideas:{' '}
                </span>
                {result.missingIdeas.map((i) => tx(i, lang)).join('; ')}
              </p>
            ) : null}
            {result.sampleAnswer ? (
              <p>
                <span className="font-medium">A strong answer: </span>
                {tx(result.sampleAnswer, lang)}
              </p>
            ) : null}
          </div>
        )}
        <div className="rounded-md border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm">
          <Markdown className="[&_p]:m-0">{tx(result.explanation, lang)}</Markdown>
        </div>
      </CardContent>
    </Card>
  );
}

function Results({
  assessment,
  result,
  lang,
  onRetry,
}: {
  assessment: AssessmentDto;
  result: AttemptResultDto;
  lang: ExplanationLanguage;
  onRetry: () => void;
}) {
  const byId = new Map(assessment.questions.map((q) => [q.id, q]));
  return (
    <div className="space-y-6">
      <Card className={result.passed ? 'border-success/40' : 'border-warning/50'}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <Trophy
              className={cn('size-10', result.passed ? 'text-success' : 'text-muted-foreground')}
              aria-hidden
            />
            <div>
              <p className="text-3xl font-bold">{result.percent}%</p>
              <p className="text-sm text-muted-foreground">
                {result.score}/{result.maxScore} points · pass mark {result.passingPercent}% ·{' '}
                {result.passed ? 'Passed' : 'Not passed yet'}
                {result.xpAwarded > 0 ? ` · +${result.xpAwarded} XP` : ''}
              </p>
            </div>
          </div>
          <Button onClick={onRetry} variant="outline">
            <RotateCcw aria-hidden /> Try again
          </Button>
        </CardContent>
      </Card>
      {!result.passed ? (
        <Alert tone="info">
          One attempt says very little about you. Read the explanations below, revisit the lesson,
          and try again.
        </Alert>
      ) : null}
      {result.results.map((r, i) => {
        const q = byId.get(r.questionId);
        return q ? (
          <ResultCard key={r.questionId} question={q} result={r} index={i} lang={lang} />
        ) : null;
      })}
    </div>
  );
}

export function QuizRunner({ assessmentId }: { assessmentId: string }) {
  const assessment = useAssessment(assessmentId);
  const submit = useSubmitAttempt(assessmentId);
  const { lang } = useLearnerLanguages();
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<AttemptResultDto | null>(null);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());

  if (assessment.isPending) return <Skeleton className="h-96" />;
  if (assessment.isError) {
    const notFound = assessment.error instanceof ApiError && assessment.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Assessment not found' : 'Could not load assessment'}
        onRetry={notFound ? undefined : () => void assessment.refetch()}
      />
    );
  }

  const a = assessment.data;
  const value = (id: string) => answers[id] ?? { selected: [], text: '' };
  const answeredCount = a.questions.filter((q) => {
    const v = value(q.id);
    return v.selected.length > 0 || v.text.trim().length > 0;
  }).length;
  const objectives = pickList(a.objectives, lang);

  const onSubmit = () => {
    const payload: AnswerInput[] = a.questions.flatMap((q): AnswerInput[] => {
      const v = value(q.id);
      if (q.type === 'short_text')
        return v.text.trim() ? [{ questionId: q.id, text: v.text.trim() }] : [];
      return v.selected.length ? [{ questionId: q.id, selectedOptionIds: v.selected }] : [];
    });
    submit.mutate(
      { answers: payload, startedAt },
      {
        onSuccess: (r) => {
          setResult(r);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> All assessments
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{tx(a.title, lang)}</h1>
        <p className="text-sm text-muted-foreground">
          {a.questions.length} questions · pass at {a.passingPercent}%
          {a.attempts.count > 0
            ? ` · ${a.attempts.count} previous attempt(s), best ${a.attempts.bestPercent}%`
            : ''}
        </p>
      </div>

      {result ? (
        <Results
          assessment={a}
          result={result}
          lang={lang}
          onRetry={() => {
            setResult(null);
            setAnswers({});
            setStartedAt(new Date().toISOString());
          }}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This quiz checks that you can</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {objectives.value.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="space-y-4"
          >
            {a.questions.map((q, i) => (
              <Card key={q.id}>
                <CardContent className="p-5">
                  <QuestionInput
                    question={q}
                    index={i}
                    value={value(q.id)}
                    onChange={(next) => setAnswers((prev) => ({ ...prev, [q.id]: next }))}
                    lang={lang}
                  />
                </CardContent>
              </Card>
            ))}
            {submit.isError ? <Alert tone="error">{errorMessage(submit.error)}</Alert> : null}
            <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 shadow-md backdrop-blur">
              <p className="text-sm text-muted-foreground">
                {answeredCount}/{a.questions.length} answered
                {answeredCount < a.questions.length ? ' — unanswered questions score 0' : ''}
              </p>
              <Button type="submit" disabled={submit.isPending || answeredCount === 0}>
                {submit.isPending ? <Spinner /> : null} Submit answers
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
