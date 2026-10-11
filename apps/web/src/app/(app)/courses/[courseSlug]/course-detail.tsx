'use client';

import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Clock,
  Code2,
  FlaskConical,
  Info,
} from 'lucide-react';
import Link from 'next/link';
import { LessonStatusIcon } from '@/components/lesson-status-icon';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, Progress, Skeleton } from '@/components/ui/feedback';
import { ApiError } from '@/lib/api';
import { useCourse } from '@/lib/curriculum';
import { pickList, pickText, tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';
import { formatMinutes } from '@/lib/utils';

export function CourseDetail({ slug }: { slug: string }) {
  const course = useCourse(slug);
  const { lang } = useLearnerLanguages();

  if (course.isPending) return <Skeleton className="h-96" />;
  if (course.isError) {
    const notFound = course.error instanceof ApiError && course.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Course not found' : 'Could not load course'}
        message={notFound ? 'It may have been renamed or unpublished.' : undefined}
        onRetry={notFound ? undefined : () => void course.refetch()}
      />
    );
  }

  const c = course.data;
  const lessons = c.modules.flatMap((m) => m.lessons);
  const nextLesson =
    lessons.find((l) => l.id === c.progress.lastLessonId && l.status !== 'completed') ??
    lessons.find((l) => l.status !== 'completed') ??
    lessons[0];
  const percent = c.progress.totalLessons
    ? (c.progress.completedLessons / c.progress.totalLessons) * 100
    : 0;
  const unmet = c.prerequisiteCourses.filter((p) => !p.satisfied);
  const description = pickText(c.description, lang);
  const outcomes = pickList(c.outcomes, lang);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/courses" className="hover:text-foreground">
            Courses
          </Link>{' '}
          / <span className="text-foreground">{tx(c.title, lang)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Level {c.level}</Badge>
          {c.requiredForTracks.map((t) => (
            <Badge key={t} variant="outline">
              Track {t}
            </Badge>
          ))}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{tx(c.title, lang)}</h1>
        <p className="max-w-3xl text-lg text-muted-foreground">{tx(c.summary, lang)}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" aria-hidden /> {c.lessonCount} lessons
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden /> ~{c.estimatedHours} hours
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {nextLesson ? (
            <Button asChild size="lg">
              <Link href={`/courses/${c.slug}/${nextLesson.slug}`}>
                {c.progress.status === 'not_started'
                  ? 'Start course'
                  : c.progress.status === 'completed'
                    ? 'Review course'
                    : 'Continue'}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
          {c.progress.status !== 'not_started' ? (
            <div className="w-56 space-y-1">
              <Progress value={percent} label="Course progress" />
              <p className="text-xs text-muted-foreground">
                {c.progress.completedLessons} of {c.progress.totalLessons} lessons complete
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {unmet.length > 0 ? (
        <Alert tone="info" title="Recommended first">
          This course builds on{' '}
          {unmet.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? ', ' : ''}
              <Link
                href={`/courses/${p.slug}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {tx(p.title, lang)}
              </Link>
            </span>
          ))}
          . You can still start now, or mark it as known on your{' '}
          <Link
            href="/path"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            learning path
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="modules-heading" className="space-y-4">
          <h2 id="modules-heading" className="text-xl font-semibold">
            Modules
          </h2>
          {c.modules.map((m, mi) => (
            <Card key={m.id}>
              <CardHeader>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Module {mi + 1}
                </p>
                <CardTitle>{tx(m.title, lang)}</CardTitle>
                <p className="text-sm text-muted-foreground">{tx(m.summary, lang)}</p>
              </CardHeader>
              <CardContent className="p-0">
                <ol className="divide-y border-t">
                  {m.lessons.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/courses/${c.slug}/${l.slug}`}
                        className="flex items-start gap-3 px-5 py-3 hover:bg-accent/40"
                      >
                        <LessonStatusIcon status={l.status} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{tx(l.title, lang)}</span>
                          <span className="block text-sm text-muted-foreground">
                            {tx(l.summary, lang)}
                          </span>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge variant="outline">
                              <Clock aria-hidden /> {formatMinutes(l.estimatedMinutes)}
                            </Badge>
                            {l.labId ? (
                              <Badge variant="default">
                                <FlaskConical aria-hidden /> Lab
                              </Badge>
                            ) : null}
                            {l.exerciseCount > 0 ? (
                              <Badge variant="secondary">
                                <Code2 aria-hidden /> Exercise
                              </Badge>
                            ) : null}
                            {l.hasAssessment ? (
                              <Badge variant="secondary">
                                <ClipboardCheck aria-hidden /> Quiz
                              </Badge>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What you will be able to do</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {outcomes.value.map((o) => (
                  <li key={o} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    {o}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About this course</CardTitle>
            </CardHeader>
            <CardContent>
              {description.fallback ? (
                <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="size-3.5" aria-hidden /> Hindi version coming soon — showing
                  Hinglish.
                </p>
              ) : null}
              <Markdown className="text-sm">{description.value}</Markdown>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
