'use client';

import {
  CAREER_GOAL_LABELS,
  TRACK_LABELS,
  type ExplanationLanguage,
  type RoadmapItemDto,
  type RoadmapItemStatus,
} from '@genpath/shared';
import { ArrowRight, Check, Lock, Pin, PinOff, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, ErrorState, Progress, Skeleton, Spinner } from '@/components/ui/feedback';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useResetRoadmap, useRoadmap, useUpdateRoadmapItem } from '@/lib/curriculum';
import { tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';
import { cn } from '@/lib/utils';

const STATUS: Record<RoadmapItemStatus, { label: string; variant: BadgeProps['variant'] }> = {
  completed: { label: 'Completed', variant: 'success' },
  in_progress: { label: 'In progress', variant: 'info' },
  known: { label: 'Known', variant: 'secondary' },
  recommended: { label: 'Recommended next', variant: 'default' },
  available: { label: 'Available', variant: 'outline' },
  locked: { label: 'Locked', variant: 'warning' },
};

function RoadmapItem({
  item,
  lang,
  index,
}: {
  item: RoadmapItemDto;
  lang: ExplanationLanguage;
  index: number;
}) {
  const update = useUpdateRoadmapItem();
  const busy = update.isPending;
  const act = (input: { known?: boolean; pinned?: boolean }, message: string) =>
    update.mutate(
      { courseId: item.courseId, ...input },
      { onSuccess: () => toast.success(message), onError: (err) => toast.error(errorMessage(err)) },
    );
  const status = STATUS[item.status];
  const done = item.status === 'completed' || item.status === 'known';

  return (
    <li className="relative pl-10">
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-5 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold',
          done
            ? 'border-success bg-success text-success-foreground'
            : item.status === 'recommended'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground',
        )}
      >
        {done ? (
          <Check className="size-4" />
        ) : item.status === 'locked' ? (
          <Lock className="size-3.5" />
        ) : (
          index + 1
        )}
      </span>
      <Card className={cn(item.status === 'recommended' && 'border-primary/50 shadow-sm')}>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="outline">Level {item.level}</Badge>
                {item.relevance === 'optional' ? <Badge variant="secondary">Optional</Badge> : null}
                {item.pinned ? (
                  <Badge variant="default">
                    <Pin aria-hidden /> Pinned
                  </Badge>
                ) : null}
              </div>
              <h3 className="text-lg font-semibold">
                <Link href={`/courses/${item.slug}`} className="hover:text-primary">
                  {tx(item.title, lang)}
                </Link>
              </h3>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>~{item.estimatedHours} h</p>
              {item.estimatedDays !== null ? <p>≈ {item.estimatedDays} days at your pace</p> : null}
            </div>
          </div>

          {item.status === 'in_progress' || item.progressPercent > 0 ? (
            <Progress value={item.progressPercent} label={`${tx(item.title, lang)} progress`} />
          ) : null}

          <ul className="space-y-1 text-sm text-muted-foreground">
            {item.reasons
              // The badge already says "Recommended next".
              .filter((reason) => reason !== 'Recommended next')
              .map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden>•</span>
                  {reason}
                </li>
              ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant={item.status === 'recommended' ? 'default' : 'outline'}
            >
              <Link href={`/courses/${item.slug}`}>
                {item.status === 'in_progress' ? 'Continue' : done ? 'Review' : 'Open course'}{' '}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            {item.status !== 'completed' ? (
              item.status === 'known' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act({ known: false }, 'Unmarked as known')}
                >
                  <Undo2 aria-hidden /> I don&apos;t know this yet
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act({ known: true }, 'Marked as known')}
                >
                  <Check aria-hidden /> I already know this
                </Button>
              )
            ) : null}
            {!done ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  act({ pinned: !item.pinned }, item.pinned ? 'Unpinned' : 'Pinned — prioritised')
                }
              >
                {item.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                {item.pinned ? 'Unpin' : 'Prioritise'}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function ResetDialog() {
  const reset = useResetRoadmap();
  const [keepKnown, setKeepKnown] = useState(true);
  const [open, setOpen] = useState(false);
  const switchId = useId();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw aria-hidden /> Reset path
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader
          title="Reset your learning path?"
          description="This removes your pins. Your progress is never deleted. To change the track itself, update your career goal in Settings."
        />
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <label htmlFor={switchId} className="text-sm">
            Keep courses I marked as known
          </label>
          <Switch id={switchId} checked={keepKnown} onCheckedChange={setKeepKnown} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(keepKnown, {
                onSuccess: () => {
                  toast.success('Learning path reset');
                  setOpen(false);
                },
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {reset.isPending ? <Spinner /> : null} Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoadmapView() {
  const roadmap = useRoadmap();
  const { lang } = useLearnerLanguages();
  const welcome = useSearchParams().get('welcome') === '1';

  if (roadmap.isPending) return <Skeleton className="h-96" />;
  if (roadmap.isError)
    return <ErrorState message="Could not load your path" onRetry={() => void roadmap.refetch()} />;

  const r = roadmap.data;
  const goal = r.careerGoal ? CAREER_GOAL_LABELS[r.careerGoal].title : 'General AI learning';

  return (
    <div className="space-y-6">
      {welcome ? (
        <Alert tone="success" title="Your roadmap is ready">
          It is ordered by prerequisites. Mark anything you already know — it will count as done and
          unlock what comes next.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Goal</p>
            <CardTitle>{goal}</CardTitle>
            {r.track ? (
              <p className="text-xs text-muted-foreground">
                Track {r.track} — {TRACK_LABELS[r.track]}
              </p>
            ) : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Remaining (core courses)</p>
            <CardTitle>{r.summary.remainingHours} h</CardTitle>
            <p className="text-xs text-muted-foreground">of {r.summary.totalHours} h total</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">At {r.dailyMinutes} min/day</p>
            <CardTitle>
              {r.summary.estimatedWeeks === null ? '—' : `≈ ${r.summary.estimatedWeeks} weeks`}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Estimates only — go at your own pace</p>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden /> {r.summary.completedCourses} of{' '}
          {r.items.length} courses completed
        </p>
        <ResetDialog />
      </div>

      <ol className="relative space-y-4 before:absolute before:bottom-6 before:left-[13px] before:top-6 before:w-0.5 before:bg-border">
        {r.items.map((item, i) => (
          <RoadmapItem key={item.courseId} item={item} lang={lang} index={i} />
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this path is built</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>• Courses are ordered by level and prerequisites.</p>
          <p>• “Required” courses come from your track; others are useful or optional.</p>
          <p>
            • A course is locked only while a prerequisite is neither completed nor marked known —
            you can still open it.
          </p>
          <p>• The next one or two courses are recommended; pinned courses come first.</p>
          <p>• Time estimates use your daily goal from Settings.</p>
        </CardContent>
      </Card>
    </div>
  );
}
