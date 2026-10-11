'use client';

import type { LessonDto, LocalizedText } from '@genpath/shared';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Code2,
  FlaskConical,
  Hammer,
  Info,
  Lightbulb,
  ListChecks,
  Target,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CodeExamples } from '@/components/code-examples';
import { LanguageSwitch } from '@/components/language-switch';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { LabSlot } from '@/features/labs/lab-slot';
import { ApiError, errorMessage } from '@/lib/api';
import { useBookmark, useCompleteLesson, useLesson, useStartLesson } from '@/lib/curriculum';
import { pickList, pickText, tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';
import { formatMinutes } from '@/lib/utils';
import { LessonNotes } from './lesson-notes';

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Info;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-3">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-primary" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function FallbackNotice() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="size-3.5" aria-hidden /> Hindi version of this lesson is not written yet —
      showing Hinglish. Ask the AI Mentor for a Hindi explanation.
    </p>
  );
}

function NavLink({
  lesson,
  direction,
}: {
  lesson: LessonDto['navigation']['next'];
  direction: 'previous' | 'next';
}) {
  const { lang } = useLearnerLanguages();
  if (!lesson) return <span />;
  return (
    <Link
      href={`/courses/${lesson.courseSlug}/${lesson.slug}`}
      className="group flex max-w-[48%] items-center gap-2 rounded-lg border bg-card p-3 text-sm hover:bg-accent/40"
    >
      {direction === 'previous' ? <ArrowLeft className="size-4 shrink-0" aria-hidden /> : null}
      <span className={direction === 'next' ? 'text-right' : undefined}>
        <span className="block text-xs text-muted-foreground">
          {direction === 'previous' ? 'Previous' : 'Next'}
        </span>
        <span className="font-medium">{tx(lesson.title, lang)}</span>
      </span>
      {direction === 'next' ? <ArrowRight className="size-4 shrink-0" aria-hidden /> : null}
    </Link>
  );
}

export function LessonView({ courseSlug, lessonSlug }: { courseSlug: string; lessonSlug: string }) {
  const lesson = useLesson(courseSlug, lessonSlug);
  const { lang, code } = useLearnerLanguages();
  const start = useStartLesson();
  const startedFor = useRef<string | null>(null);
  const lessonId = lesson.data?.id ?? '';
  const complete = useCompleteLesson(lessonId);
  const bookmark = useBookmark(lessonId);
  const { mutate: startMutate } = start;

  // Record that the lesson was opened (idempotent on the server; once per lesson here).
  useEffect(() => {
    const data = lesson.data;
    if (data && data.progress.status === 'not_started' && startedFor.current !== data.id) {
      startedFor.current = data.id;
      startMutate(data.id);
    }
  }, [lesson.data, startMutate]);

  if (lesson.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (lesson.isError) {
    const notFound = lesson.error instanceof ApiError && lesson.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Lesson not found' : 'Could not load lesson'}
        message={notFound ? undefined : errorMessage(lesson.error)}
        onRetry={notFound ? undefined : () => void lesson.refetch()}
      />
    );
  }

  const l = lesson.data;
  const s = l.sections;
  const t = (text: LocalizedText) => pickText(text, lang);
  const explanation = t(s.explanation);
  const objectives = pickList(l.objectives, lang);
  const mistakes = pickList(s.commonMistakes, lang);
  const summary = pickList(s.summary, lang);
  const unmetPrereqs = l.prerequisites.filter((p) => !p.completed);
  const completed = l.progress.status === 'completed';

  const onComplete = () =>
    complete.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          result.xpAwarded > 0
            ? `Lesson complete! +${result.xpAwarded} XP · ${result.stats.currentStreak}-day streak`
            : 'Lesson marked complete',
        );
        if (result.courseCompleted) toast.success('🎉 You finished the whole course!');
      },
      onError: (err) => toast.error(errorMessage(err)),
    });

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/courses" className="hover:text-foreground">
            Courses
          </Link>{' '}
          /{' '}
          <Link href={`/courses/${l.courseSlug}`} className="hover:text-foreground">
            {tx(l.courseTitle, lang)}
          </Link>{' '}
          / <span>{tx(l.moduleTitle, lang)}</span>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{tx(l.title, lang)}</h1>
        <p className="text-lg text-muted-foreground">{tx(l.summary, lang)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">
            <Clock aria-hidden /> {formatMinutes(l.estimatedMinutes)}
          </Badge>
          {completed ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden /> Completed
            </Badge>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LanguageSwitch value={lang} />
            <Button
              variant="outline"
              size="sm"
              aria-pressed={l.progress.bookmarked}
              onClick={() =>
                bookmark.mutate(!l.progress.bookmarked, {
                  onSuccess: () => void lesson.refetch(),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              {l.progress.bookmarked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
              {l.progress.bookmarked ? 'Bookmarked' : 'Bookmark'}
            </Button>
          </div>
        </div>
        {explanation.fallback ? <FallbackNotice /> : null}
      </header>

      {unmetPrereqs.length > 0 ? (
        <Alert tone="info" title="Recommended before this lesson">
          <ul className="mt-1 space-y-0.5">
            {unmetPrereqs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/courses/${p.courseSlug}/${p.slug}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {tx(p.title, lang)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Already comfortable with it? Carry on — prerequisites are advice, not a lock.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-primary" aria-hidden /> By the end of this lesson you can
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {objectives.value.map((o) => (
              <li key={o} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Section id="explanation" title="Explanation" icon={Lightbulb}>
        <Markdown>{explanation.value}</Markdown>
      </Section>

      <aside aria-label="Analogy" className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <p className="mb-2 text-sm font-semibold text-primary">Real-world analogy</p>
        <Markdown>{t(s.analogy).value}</Markdown>
      </aside>

      {l.lab || s.visual ? (
        <Section id="visual" title="See it work" icon={FlaskConical}>
          {s.visual ? <Markdown>{t(s.visual).value}</Markdown> : null}
          {l.lab ? <LabSlot lab={l.lab} lang={lang} /> : null}
        </Section>
      ) : null}

      {l.codeExamples.length > 0 ? (
        <Section id="code" title="Working code" icon={Code2}>
          <CodeExamples examples={l.codeExamples} lang={lang} preferred={code} />
        </Section>
      ) : null}

      <Section id="guided" title="Guided exercise" icon={ListChecks}>
        <Markdown>{t(s.guidedExercise).value}</Markdown>
      </Section>

      <Section id="practice" title="Practice and challenge" icon={Hammer}>
        {l.exercises.length > 0 ? (
          <ul className="grid gap-2">
            {l.exercises.map((ex) => (
              <li key={ex.id}>
                <Link
                  href={`/practice/${ex.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-accent/40"
                >
                  <span className="flex items-center gap-3">
                    <Code2 className="size-5 text-primary" aria-hidden />
                    <span>
                      <span className="block font-medium">{tx(ex.title, lang)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Python · runs in your browser · {ex.attempts} attempt
                        {ex.attempts === 1 ? '' : 's'}
                      </span>
                    </span>
                  </span>
                  {ex.passed ? (
                    <Badge variant="success">Passed</Badge>
                  ) : (
                    <ArrowRight className="size-4" aria-hidden />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="rounded-lg border border-dashed p-4">
          <p className="mb-1 text-sm font-semibold">Independent challenge</p>
          <Markdown>{t(s.challenge).value}</Markdown>
        </div>
      </Section>

      {l.assessment ? (
        <Section id="quiz" title="Check your understanding" icon={ClipboardCheck}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{tx(l.assessment.title, lang)}</p>
                <p className="text-sm text-muted-foreground">
                  {l.assessment.questionCount} questions ·{' '}
                  {l.assessment.bestPercent === null
                    ? 'not attempted yet'
                    : `best score ${l.assessment.bestPercent}%${l.assessment.passed ? ' · passed' : ''}`}
                </p>
              </div>
              <Button asChild variant={l.assessment.passed ? 'outline' : 'default'}>
                <Link href={`/assessments/${l.assessment.id}`}>
                  {l.assessment.bestPercent === null ? 'Take the quiz' : 'Retake quiz'}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </Section>
      ) : null}

      <Section id="mistakes" title="Common mistakes" icon={TriangleAlert}>
        <ul className="space-y-2">
          {mistakes.value.map((m) => (
            <li key={m} className="flex gap-2 rounded-lg border bg-card p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <Markdown className="[&_p]:m-0">{m}</Markdown>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="project" title="Where this shows up in projects" icon={Hammer}>
        <Markdown>{t(s.projectApplication).value}</Markdown>
        {l.projects.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {l.projects.map((p) => (
              <Button key={p.id} asChild variant="outline" size="sm">
                <Link href={`/projects/${p.id}`}>{tx(p.title, lang)}</Link>
              </Button>
            ))}
          </div>
        ) : null}
      </Section>

      <Section id="summary" title="Summary and revision" icon={ListChecks}>
        <ul className="space-y-1.5">
          {summary.value.map((item) => (
            <li key={item} className="flex gap-2 text-sm">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <Markdown className="[&_p]:m-0">{item}</Markdown>
            </li>
          ))}
        </ul>
      </Section>

      <LessonNotes key={l.id} lessonId={l.id} initial={l.progress.notes} />

      <Card className="border-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <Bot className="size-6 text-primary" aria-hidden />
            <div>
              <p className="font-medium">Stuck or curious?</p>
              <p className="text-sm text-muted-foreground">
                The AI Mentor knows which lesson you are on.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/mentor?lessonId=${l.id}`}>Ask the mentor</Link>
            </Button>
            <Button onClick={onComplete} disabled={complete.isPending || completed}>
              {complete.isPending ? <Spinner /> : <CheckCircle2 aria-hidden />}
              {completed ? 'Completed' : 'Mark lesson complete'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {l.related.length > 0 ? (
        <div className="text-sm">
          <span className="text-muted-foreground">Related: </span>
          {l.related.map((r, i) => (
            <span key={r.id}>
              {i > 0 ? ' · ' : ''}
              <Link
                href={`/courses/${r.courseSlug}/${r.slug}`}
                className="text-primary hover:underline"
              >
                {tx(r.title, lang)}
              </Link>
            </span>
          ))}
        </div>
      ) : null}

      <nav aria-label="Lesson navigation" className="flex justify-between gap-4">
        <NavLink lesson={l.navigation.previous} direction="previous" />
        <NavLink lesson={l.navigation.next} direction="next" />
      </nav>
    </article>
  );
}
