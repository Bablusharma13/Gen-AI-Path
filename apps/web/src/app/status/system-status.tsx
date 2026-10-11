'use client';

import type { ReadinessReport } from '@genpath/shared';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { rawRequest } from '@/lib/api';

async function fetchReadiness(): Promise<ReadinessReport> {
  // 503 still carries a full report, so read the body regardless of status.
  const res = await rawRequest('/health/ready', { skipRefresh: true });
  const body = (await res.json()) as { data?: ReadinessReport };
  if (!body.data) throw new Error(`API responded with ${res.status}`);
  return body.data;
}

function stateBadge(state: string) {
  const variant =
    state === 'up' || state === 'configured' || state === 'ready'
      ? 'success'
      : state === 'down' || state === 'not_ready'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={variant}>{state.replace('_', ' ')}</Badge>;
}

export function SystemStatus() {
  const query = useQuery({ queryKey: ['health'], queryFn: fetchReadiness, retry: false });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) {
    return (
      <ErrorState
        title="The API is unreachable"
        message="Start it with `pnpm dev` and check API_URL."
        onRetry={() => void query.refetch()}
      />
    );
  }

  const r = query.data;
  const rows: [string, React.ReactNode, string?][] = [
    ['Overall', stateBadge(r.status), `v${r.version} · up ${r.uptimeSec}s`],
    [
      'MongoDB',
      stateBadge(r.checks.mongodb.state),
      r.checks.mongodb.latencyMs !== undefined ? `${r.checks.mongodb.latencyMs} ms` : undefined,
    ],
    [
      'Redis',
      stateBadge(r.checks.redis.state),
      r.checks.redis.state === 'not_configured'
        ? 'In-memory fallback (development only)'
        : r.checks.redis.latencyMs !== undefined
          ? `${r.checks.redis.latencyMs} ms`
          : undefined,
    ],
    [
      'Job queue',
      <Badge key="q" variant="secondary">
        {r.checks.queue.mode}
      </Badge>,
    ],
    ['AI provider', stateBadge(r.checks.ai.state), r.checks.ai.provider],
    [
      'Embeddings',
      <Badge key="e" variant={r.checks.embeddings.semantic ? 'success' : 'warning'}>
        {r.checks.embeddings.semantic ? 'semantic' : 'lexical (local)'}
      </Badge>,
      r.checks.embeddings.provider,
    ],
  ];

  return (
    <Card>
      <CardContent className="p-0">
        <dl className="divide-y">
          {rows.map(([label, value, note]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-sm font-medium">{label}</dt>
              <dd className="flex items-center gap-3 text-right text-sm text-muted-foreground">
                {note ? <span>{note}</span> : null}
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-end border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />{' '}
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
