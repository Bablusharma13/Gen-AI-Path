'use client';

import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_CATEGORY_LABELS,
  SKILL_LEVEL_LABELS,
  SKILL_LEVELS,
  TRACK_LABELS,
  type InterviewCategory,
  type InterviewQuestionDto,
  type PracticeStatus,
  type SkillLevel,
} from '@genpath/shared';
import { Bot, CheckCircle2, Circle, Info, MessageSquareQuote, Save } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Label, NativeSelect, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useCareerOverview, useInterviewQuestions, useSetPractice } from '@/lib/career';
import { pickList, tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';

function Readiness() {
  const overview = useCareerOverview();
  if (overview.isPending) return <Skeleton className="h-72" />;
  if (overview.isError)
    return (
      <ErrorState message="Could not load your progress" onRetry={() => void overview.refetch()} />
    );
  const o = overview.data;
  const done = o.readiness.filter((r) => r.done).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your checklist</CardTitle>
          <CardDescription>
            {o.track ? `Goal: ${TRACK_LABELS[o.track]}. ` : ''}
            {done} of {o.readiness.length} done.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3">
            {o.readiness.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-label="Not done yet"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={item.href} className="font-medium hover:underline">
                    {item.label}
                  </Link>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            This checklist only counts what you have done on GenPath AI. It is not a score of your
            ability and not a prediction of hiring outcomes — real interviews also depend on your
            portfolio, communication and the role.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interview practice by topic</CardTitle>
          <CardDescription>
            Your own self-assessment, for questions relevant to your goal.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Questions
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Confident
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Practise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {o.byCategory.map((c) => (
                  <tr key={c.category}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      {INTERVIEW_CATEGORY_LABELS[c.category]}
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums">{c.total}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.confident}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.needsPractice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const STATUS_OPTIONS: { value: PracticeStatus; label: string }[] = [
  { value: 'needs_practice', label: 'Needs practice' },
  { value: 'confident', label: 'Confident' },
];

function QuestionCard({ q }: { q: InterviewQuestionDto }) {
  const { lang } = useLearnerLanguages();
  const setPractice = useSetPractice();
  const [notes, setNotes] = useState(q.practice.notes);
  const notesId = useId();
  const question = tx(q.question, lang);
  const mentorPrompt = `Interview practice. Ask me this question, wait for my answer, then give feedback against the key points: ${tx(q.question, 'en')}`;

  const save = (input: { status: PracticeStatus | null; notes?: string }, message?: string) =>
    setPractice.mutate(
      { questionId: q.id, ...input },
      {
        onSuccess: () => {
          if (message) toast.success(message);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{INTERVIEW_CATEGORY_LABELS[q.category]}</Badge>
          <Badge variant="outline">{SKILL_LEVEL_LABELS[q.level]}</Badge>
          {q.practice.status === 'confident' ? <Badge variant="success">Confident</Badge> : null}
          {q.practice.status === 'needs_practice' ? (
            <Badge variant="warning">Needs practice</Badge>
          ) : null}
        </div>
        <CardTitle className="text-base leading-snug">
          <Markdown className="[&_p]:m-0">{question}</Markdown>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="group rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Answer it yourself first, then show key points and a sample answer
          </summary>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="mb-1 font-medium">A strong answer covers</p>
              <ul className="list-disc space-y-1 pl-5">
                {pickList(q.keyPoints, lang).value.map((k) => (
                  <li key={k}>
                    <Markdown className="[&_p]:m-0">{k}</Markdown>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium">Sample answer</p>
              <Markdown>{tx(q.sampleAnswer, lang)}</Markdown>
            </div>
            {q.followUps ? (
              <div>
                <p className="mb-1 font-medium">Likely follow-ups</p>
                <ul className="list-disc space-y-1 pl-5">
                  {pickList(q.followUps, lang).value.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {q.relatedLessons.length > 0 ? (
              <p className="text-muted-foreground">
                Revise:{' '}
                {q.relatedLessons.map((l, i) => (
                  <span key={l.id}>
                    {i > 0 ? ', ' : ''}
                    <Link
                      href={`/courses/${l.courseSlug}/${l.slug}`}
                      className="text-primary hover:underline"
                    >
                      {tx(l.title, lang)}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </details>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="How confident are you?"
        >
          {STATUS_OPTIONS.map((o) => {
            const active = q.practice.status === o.value;
            return (
              <Button
                key={o.value}
                size="sm"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                disabled={setPractice.isPending}
                onClick={() => save({ status: active ? null : o.value })}
              >
                {o.label}
              </Button>
            );
          })}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/mentor?prompt=${encodeURIComponent(mentorPrompt)}`}>
              <Bot aria-hidden /> Practise with the AI Mentor
            </Link>
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={notesId}>Private notes</Label>
          <Textarea
            id={notesId}
            className="min-h-16"
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Your own answer outline, a project example to mention…"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={notes === q.practice.notes || setPractice.isPending}
            onClick={() => save({ status: q.practice.status, notes }, 'Notes saved')}
          >
            <Save aria-hidden /> Save notes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QuestionBank() {
  const questions = useInterviewQuestions();
  const [category, setCategory] = useState<InterviewCategory | ''>('');
  const [level, setLevel] = useState<SkillLevel | ''>('');
  const [status, setStatus] = useState<PracticeStatus | 'unreviewed' | ''>('');
  const ids = { category: useId(), level: useId(), status: useId() };

  if (questions.isPending) return <Skeleton className="h-96" />;
  if (questions.isError)
    return (
      <ErrorState message="Could not load questions" onRetry={() => void questions.refetch()} />
    );

  const filtered = questions.data.filter(
    (q) =>
      (!category || q.category === category) &&
      (!level || q.level === level) &&
      (!status ||
        (status === 'unreviewed' ? q.practice.status === null : q.practice.status === status)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={ids.category}>Topic</Label>
          <NativeSelect
            id={ids.category}
            className="w-52"
            value={category}
            onChange={(e) => setCategory(e.target.value as InterviewCategory | '')}
          >
            <option value="">All topics</option>
            {INTERVIEW_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INTERVIEW_CATEGORY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.level}>Level</Label>
          <NativeSelect
            id={ids.level}
            className="w-40"
            value={level}
            onChange={(e) => setLevel(e.target.value as SkillLevel | '')}
          >
            <option value="">All levels</option>
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {SKILL_LEVEL_LABELS[l]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.status}>Status</Label>
          <NativeSelect
            id={ids.status}
            className="w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value as PracticeStatus | 'unreviewed' | '')}
          >
            <option value="">Any status</option>
            <option value="unreviewed">Not reviewed yet</option>
            <option value="needs_practice">Needs practice</option>
            <option value="confident">Confident</option>
          </NativeSelect>
        </div>
        <p className="pb-2 text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} of {questions.data.length} questions
        </p>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title="No questions match these filters" />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {filtered.map((q) => (
            <li key={q.id}>
              <QuestionCard q={q} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CareerView() {
  return (
    <div className="space-y-10">
      <section aria-labelledby="readiness-title" className="space-y-3">
        <h2 id="readiness-title" className="text-lg font-semibold">
          Where you stand
        </h2>
        <Readiness />
      </section>
      <section id="questions" aria-labelledby="questions-title" className="scroll-mt-24 space-y-3">
        <h2 id="questions-title" className="text-lg font-semibold">
          Interview question bank
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Say or write your answer before opening the key points. Marking a question “confident” is
          your own judgement — nothing here is graded automatically.
        </p>
        <QuestionBank />
      </section>
    </div>
  );
}
