'use client';

import type { AssessmentListItemDto } from '@genpath/shared';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useAssessments } from '@/lib/curriculum';
import { tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';
import { formatRelative } from '@/lib/utils';

export function AssessmentList() {
  const list = useAssessments();
  const { lang } = useLearnerLanguages();

  if (list.isPending) return <Skeleton className="h-96" />;
  if (list.isError)
    return <ErrorState message="Could not load assessments" onRetry={() => void list.refetch()} />;
  if (list.data.length === 0)
    return <EmptyState icon={ClipboardCheck} title="No assessments yet" />;

  const byCourse = new Map<string, AssessmentListItemDto[]>();
  for (const a of list.data) byCourse.set(a.courseId, [...(byCourse.get(a.courseId) ?? []), a]);
  const passed = list.data.filter((a) => a.passed).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Passed {passed} of {list.data.length}
      </p>
      {[...byCourse.values()].map((items) => (
        <Card key={items[0]!.courseId}>
          <CardHeader>
            <CardTitle className="text-base">{tx(items[0]!.courseTitle, lang)}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {items.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {a.passed ? (
                        <CheckCircle2 className="size-4 text-success" aria-label="Passed" />
                      ) : null}
                      {tx(a.title, lang)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.questionCount} questions · pass at {a.passingPercent}%
                      {a.attempts > 0
                        ? ` · ${a.attempts} attempt${a.attempts === 1 ? '' : 's'} · best ${a.bestPercent}% · last ${formatRelative(a.lastAttemptAt!)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.bestPercent !== null ? (
                      <Badge variant={a.passed ? 'success' : 'warning'}>{a.bestPercent}%</Badge>
                    ) : null}
                    <Button asChild size="sm" variant={a.attempts === 0 ? 'default' : 'outline'}>
                      <Link href={`/assessments/${a.id}`}>
                        {a.attempts === 0 ? 'Start' : 'Retake'}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
