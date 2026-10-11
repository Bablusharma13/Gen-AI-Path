'use client';

import { ROLE_LABELS, ROLES } from '@genpath/shared';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useAdminOverview } from '@/lib/admin';
import { formatRelative } from '@/lib/utils';

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function OverviewPanel() {
  const overview = useAdminOverview();
  if (overview.isPending) return <Skeleton className="h-80" />;
  if (overview.isError)
    return (
      <ErrorState message="Could not load the overview" onRetry={() => void overview.refetch()} />
    );
  const o = overview.data;
  const cost =
    o.ai.costLast30DaysUsd === null
      ? 'Unknown'
      : o.ai.costLast30DaysUsd < 0.01
        ? `$${o.ai.costLast30DaysUsd.toFixed(4)}`
        : `$${o.ai.costLast30DaysUsd.toFixed(2)}`;

  return (
    <div className="space-y-6">
      <section aria-labelledby="ov-users" className="space-y-3">
        <h2 id="ov-users" className="text-sm font-semibold">
          People
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Accounts"
            value={o.users.total}
            hint={`${o.users.newLast7Days} new in the last 7 days`}
          />
          <Stat
            label="Active learners (7 days)"
            value={o.users.activeLast7Days}
            hint="Recorded any learning activity"
          />
          <Stat label="Suspended" value={o.users.suspended} />
          <Stat
            label="Roles"
            value={
              <span className="text-base">
                {ROLES.map((r) => `${o.users.byRole[r]} ${ROLE_LABELS[r]}`).join(' · ')}
              </span>
            }
          />
        </div>
      </section>
      <section aria-labelledby="ov-learning" className="space-y-3">
        <h2 id="ov-learning" className="text-sm font-semibold">
          Learning (last 7 days)
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Lessons completed" value={o.learning.lessonsCompletedLast7Days} />
          <Stat label="Quiz attempts" value={o.learning.assessmentsSubmittedLast7Days} />
          <Stat
            label="Project submissions awaiting review"
            value={o.learning.projectSubmissionsPending}
          />
        </div>
      </section>
      <section aria-labelledby="ov-ai" className="space-y-3">
        <h2 id="ov-ai" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          AI
          <Badge
            variant={o.ai.provider === 'none' ? 'outline' : o.ai.isMock ? 'warning' : 'success'}
          >
            {o.ai.provider === 'none'
              ? 'Not configured'
              : o.ai.isMock
                ? 'Mock provider (development)'
                : `${o.ai.provider} · ${o.ai.model ?? 'no model set'}`}
          </Badge>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Requests today" value={o.ai.requestsToday} />
          <Stat
            label="Requests (30 days)"
            value={o.ai.requestsLast30Days}
            hint={`${o.ai.errorsLast30Days} failed`}
          />
          <Stat
            label="Estimated cost (30 days)"
            value={cost}
            hint={
              o.ai.unpricedRequestsLast30Days > 0
                ? `${o.ai.unpricedRequestsLast30Days} requests used a model without a known price (set AI_PRICING_JSON)`
                : 'From reported token usage and configured prices'
            }
          />
          <Stat
            label="Knowledge base"
            value={`${o.knowledge.documents} docs`}
            hint={`${o.knowledge.organizations} organizations · ${o.knowledge.chunks} passages · ${o.knowledge.failedDocuments} failed`}
          />
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Generated {formatRelative(o.generatedAt)} from live data.
      </p>
    </div>
  );
}
