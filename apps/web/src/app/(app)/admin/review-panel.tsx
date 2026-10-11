'use client';

import type { ReviewQueueItemDto } from '@genpath/shared';
import { Inbox } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Label, NativeSelect, Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { tx } from '@/lib/localize';
import { useReviewQueue, useReviewSubmission } from '@/lib/projects';
import { useLearnerLanguages } from '@/lib/use-learner';
import { formatRelative } from '@/lib/utils';

function ReviewCard({ item }: { item: ReviewQueueItemDto }) {
  const { lang } = useLearnerLanguages();
  const review = useReviewSubmission();
  const [feedback, setFeedback] = useState('');
  const id = useId();
  const assessed = new Map(item.checklist.map((c) => [c.criterionId, c.selfAssessed]));

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{tx(item.projectTitle, lang)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {item.learnerName} · submitted {formatRelative(item.createdAt)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <a
            href={item.repoUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-primary hover:underline"
          >
            {item.repoUrl}
          </a>
          {item.demoUrl ? (
            <>
              {' · '}
              <a
                href={item.demoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-primary hover:underline"
              >
                demo
              </a>
            </>
          ) : null}
        </p>
        {item.notes ? (
          <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-3">{item.notes}</p>
        ) : null}
        <ul className="space-y-1">
          {item.rubric.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={assessed.get(r.id) ? 'success' : 'outline'}>
                {assessed.get(r.id) ? 'Self: met' : 'Self: not claimed'}
              </Badge>
              {tx(r.criterion, lang)} ({r.points} pts)
            </li>
          ))}
        </ul>
        {item.status === 'reviewed' ? (
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs text-muted-foreground">
              Feedback{item.reviewerName ? ` by ${item.reviewerName}` : ''}
            </p>
            <p className="whitespace-pre-wrap">{item.feedback}</p>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              review.mutate(
                { submissionId: item.id, feedback: feedback.trim() },
                {
                  onSuccess: () => toast.success('Feedback sent'),
                  onError: (err) => toast.error(errorMessage(err)),
                },
              );
            }}
          >
            <Label htmlFor={id}>Feedback for the learner</Label>
            <Textarea
              id={id}
              maxLength={4000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What works well, what to fix, and one concrete next step. Refer to the rubric."
            />
            <Button type="submit" disabled={review.isPending || feedback.trim().length < 10}>
              {review.isPending ? <Spinner label="Sending" /> : null} Send review
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewPanel() {
  const [status, setStatus] = useState<'submitted' | 'reviewed'>('submitted');
  const queue = useReviewQueue(status);
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={id}>Show</Label>
        <NativeSelect
          id={id}
          className="w-48"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'submitted' | 'reviewed')}
        >
          <option value="submitted">Awaiting review</option>
          <option value="reviewed">Reviewed</option>
        </NativeSelect>
      </div>
      {queue.isPending ? (
        <Skeleton className="h-64" />
      ) : queue.isError ? (
        <ErrorState message="Could not load submissions" onRetry={() => void queue.refetch()} />
      ) : queue.data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'submitted' ? 'Nothing to review' : 'No reviewed submissions yet'}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {queue.data.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
