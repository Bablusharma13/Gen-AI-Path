'use client';

import type { ExplanationLanguage, ProgressSummaryDto } from '@genpath/shared';
import {
  ArrowRight,
  Bookmark,
  BookOpenCheck,
  CalendarCheck,
  Flame,
  History,
  MailWarning,
  Sparkles,
  Target,
  TrendingDown,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui/feedback';
import { useMe } from '@/lib/auth';
import { useBookmarks, useProgressSummary } from '@/lib/curriculum';
import { tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';
import { formatRelative } from '@/lib/utils';

const EVENT_LABELS: Record<string, string> = {
  lesson_started: 'Started',
  lesson_completed: 'Completed',
  assessment_submitted: 'Quiz',
  exercise_attempted: 'Exercise',
  lab_used: 'Lab',
  mentor_question: 'Mentor',
  project_milestone: 'Project',
  project_submitted: 'Submitted',
};

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyActivity({ days }: { days: ProgressSummaryDto['weeklyActivity'] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div className="flex h-24 items-end gap-2" aria-hidden>
        {days.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-primary/70"
              style={{
                height: `${Math.max(4, (d.count / max) * 80)}px`,
                opacity: d.count ? 1 : 0.25,
              }}
            />
            <span className="text-[10px] text-muted-foreground">
              {new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en', {
                weekday: 'short',
                timeZone: 'UTC',
              })}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Learning activities in the last 7 days</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardBody({ s, lang }: { s: ProgressSummaryDto; lang: ExplanationLanguage }) {
  const bookmarks = useBookmarks();
  const overall = s.totalLessons ? (s.completedLessons / s.totalLessons) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Flame}
          label="Streak"
          value={`${s.stats.currentStreak} day${s.stats.currentStreak === 1 ? '' : 's'}`}
          hint={`Longest ${s.stats.longestStreak}`}
        />
        <Stat icon={Trophy} label="XP" value={s.stats.xp.toLocaleString()} />
        <Stat
          icon={BookOpenCheck}
          label="Lessons completed"
          value={`${s.completedLessons}/${s.totalLessons}`}
        />
        <Stat
          icon={CalendarCheck}
          label="Today"
          value={`${s.today.lessonsCompleted} lesson${s.today.lessonsCompleted === 1 ? '' : 's'}`}
          hint={`Goal: ${s.today.minutesGoal} min · ${s.today.activities} activities`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="size-4 text-primary" aria-hidden /> Continue learning
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.continueLearning ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {tx(s.continueLearning.courseTitle, lang)}
                    </p>
                    <p className="text-lg font-semibold">{tx(s.continueLearning.title, lang)}</p>
                  </div>
                  <Button asChild>
                    <Link
                      href={`/courses/${s.continueLearning.courseSlug}/${s.continueLearning.slug}`}
                    >
                      {s.continueLearning.status === 'in_progress' ? 'Resume' : 'Start next lesson'}{' '}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              ) : s.recommendedLesson ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {tx(s.recommendedLesson.courseTitle, lang)} · {s.recommendedLesson.reason}
                    </p>
                    <p className="text-lg font-semibold">{tx(s.recommendedLesson.title, lang)}</p>
                  </div>
                  <Button asChild>
                    <Link
                      href={`/courses/${s.recommendedLesson.courseSlug}/${s.recommendedLesson.slug}`}
                    >
                      Start <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You have finished every published lesson on your path. Explore the{' '}
                  <Link href="/projects" className="text-primary hover:underline">
                    projects
                  </Link>
                  .
                </p>
              )}
            </CardContent>
          </Card>

          {s.continueLearning &&
          s.recommendedLesson &&
          s.recommendedLesson.id !== s.continueLearning.id ? (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-1 size-4 text-primary" aria-hidden />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Recommended · {s.recommendedLesson.reason}
                    </p>
                    <p className="font-medium">{tx(s.recommendedLesson.title, lang)}</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/courses/${s.recommendedLesson.courseSlug}/${s.recommendedLesson.slug}`}
                  >
                    Open
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Course progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>All published lessons</span>
                  <span className="text-muted-foreground">{Math.round(overall)}%</span>
                </div>
                <Progress value={overall} label="Overall progress" />
              </div>
              {s.coursesInProgress.length === 0 ? (
                <p className="text-sm text-muted-foreground">No course started yet.</p>
              ) : (
                s.coursesInProgress.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <Link href={`/courses/${c.slug}`} className="hover:text-primary">
                        {tx(c.title, lang)}
                      </Link>
                      <span className="text-muted-foreground">{c.percent}%</span>
                    </div>
                    <Progress value={c.percent} label={`${tx(c.title, lang)} progress`} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="size-4 text-warning" aria-hidden /> Topics to revisit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.weakTopics.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing flagged. A topic appears here only after repeated misses across separate
                  quiz attempts — never from a single attempt.
                </p>
              ) : (
                <ul className="space-y-4">
                  {s.weakTopics.map((w) => (
                    <li key={w.topic} className="space-y-1">
                      <p className="font-medium capitalize">{w.topic.replaceAll('-', ' ')}</p>
                      <p className="text-sm text-muted-foreground">{w.evidence}</p>
                      <div className="flex flex-wrap gap-2">
                        {w.suggestedLessons.map((l) => (
                          <Button key={l.id} asChild size="sm" variant="outline">
                            <Link href={`/courses/${l.courseSlug}/${l.slug}`}>
                              Revise: {tx(l.title, lang)}
                            </Link>
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This week</CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyActivity days={s.weeklyActivity} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" aria-hidden /> Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your activity will appear here.</p>
              ) : (
                <ul className="space-y-3">
                  {s.recentActivity.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="text-sm">
                      <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                        {EVENT_LABELS[a.type] ?? a.type}
                      </span>
                      {a.title}
                      <span className="block text-xs text-muted-foreground">
                        {formatRelative(a.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bookmark className="size-4" aria-hidden /> Bookmarks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookmarks.data && bookmarks.data.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {bookmarks.data.slice(0, 6).map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/courses/${b.courseSlug}/${b.slug}`}
                        className="hover:text-primary"
                      >
                        {tx(b.title, lang)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Bookmark lessons to revisit them quickly.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const me = useMe();
  const summary = useProgressSummary();
  const { lang } = useLearnerLanguages();
  const firstName = me.data?.name.split(' ')[0] ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Namaste{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="text-muted-foreground">Chhote steps, roz. Small steps, every day.</p>
      </div>
      {me.data && !me.data.emailVerified ? (
        <Alert
          tone="warning"
          title="Verify your email"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/settings?tab=security">
                <MailWarning aria-hidden /> Resend link
              </Link>
            </Button>
          }
        >
          It protects your account and lets you reset your password.
        </Alert>
      ) : null}
      {summary.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : summary.isError ? (
        <ErrorState message="Could not load your progress" onRetry={() => void summary.refetch()} />
      ) : summary.data.totalLessons === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No lessons published yet"
          description="An administrator needs to run the content seed (pnpm seed)."
        />
      ) : (
        <DashboardBody s={summary.data} lang={lang} />
      )}
    </div>
  );
}
