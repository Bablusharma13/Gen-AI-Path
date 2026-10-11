'use client';

import { ScrollText } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Input, Label } from '@/components/ui/input';
import { useAuditLogs } from '@/lib/admin';
import { formatDate } from '@/lib/utils';

export function AuditPanel() {
  const [draft, setDraft] = useState('');
  const [action, setAction] = useState('');
  const logs = useAuditLogs(action);
  const id = useId();
  const rows = logs.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setAction(draft.trim());
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={id}>Filter by exact action</Label>
          <Input
            id={id}
            className="w-72 font-mono text-xs"
            placeholder="e.g. admin.user_updated"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Security-relevant actions with the actor, target and small metadata. Passwords, tokens and
        document contents are never logged; IP addresses are stored only as keyed hashes.
      </p>
      {logs.isPending ? (
        <Skeleton className="h-64" />
      ) : logs.isError ? (
        <ErrorState message="Could not load the audit log" onRetry={() => void logs.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No entries" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Actor
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Target
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-3 py-2">
                      {r.actorName ?? (
                        <span className="text-muted-foreground">System / anonymous</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.targetType ? `${r.targetType} ${r.targetId ?? ''}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {logs.hasNextPage ? (
        <Button
          variant="outline"
          disabled={logs.isFetchingNextPage}
          onClick={() => void logs.fetchNextPage()}
        >
          {logs.isFetchingNextPage ? <Spinner label="Loading" /> : null} Load more
        </Button>
      ) : null}
    </div>
  );
}
