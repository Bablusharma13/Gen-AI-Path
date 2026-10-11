'use client';

import { SKILL_LEVEL_LABELS, type ProjectStatus } from '@genpath/shared';
import { Clock, Hammer } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui/feedback';
import { tx } from '@/lib/localize';
import { useProjects } from '@/lib/projects';
import { useLearnerLanguages } from '@/lib/use-learner';

export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; variant: 'outline' | 'info' | 'warning' | 'success' }
> = {
  not_started: { label: 'Not started', variant: 'outline' },
  in_progress: { label: 'In progress', variant: 'info' },
  submitted: { label: 'Submitted', variant: 'warning' },
  reviewed: { label: 'Reviewed', variant: 'success' },
};

export function ProjectList() {
  const projects = useProjects();
  const { lang } = useLearnerLanguages();

  if (projects.isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (projects.isError)
    return <ErrorState message="Could not load projects" onRetry={() => void projects.refetch()} />;
  if (projects.data.length === 0)
    return <EmptyState icon={Hammer} title="No projects published yet" />;

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {projects.data.map((p) => {
        const status = PROJECT_STATUS[p.status];
        const percent = p.milestoneCount ? (p.completedMilestones / p.milestoneCount) * 100 : 0;
        return (
          <li key={p.id}>
            <Card className="relative h-full transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-accent/30">
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{SKILL_LEVEL_LABELS[p.level]}</Badge>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden /> ~{p.estimatedHours} h
                  </span>
                </div>
                <CardTitle className="text-lg">
                  <Link
                    href={`/projects/${p.id}`}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {tx(p.title, lang)}
                  </Link>
                </CardTitle>
                <CardDescription>{tx(p.summary, lang)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="flex flex-wrap gap-1.5" aria-label="Tech stack">
                  {p.techStack.map((t) => (
                    <li key={t}>
                      <Badge variant="outline">{t}</Badge>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {p.completedMilestones} of {p.milestoneCount} milestones
                  </p>
                  <Progress value={percent} label={`${tx(p.title, lang)} milestones`} />
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
