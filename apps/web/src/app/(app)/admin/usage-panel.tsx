'use client';

import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Label, NativeSelect } from '@/components/ui/input';
import { BarList } from '@/components/viz/bar-list';
import { ChartFrame, DataTable } from '@/components/viz/chart-frame';
import { LineChart } from '@/components/viz/line-chart';
import { useAiUsage, usePrompts } from '@/lib/admin';

const usd = (v: number | null) =>
  v === null ? '—' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;

export function UsagePanel() {
  const [days, setDays] = useState(30);
  const usage = useAiUsage(days);
  const prompts = usePrompts();
  const daysId = useId();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={daysId}>Period</Label>
        <NativeSelect
          id={daysId}
          className="w-40"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </NativeSelect>
      </div>
      {usage.isPending ? (
        <Skeleton className="h-80" />
      ) : usage.isError ? (
        <ErrorState message="Could not load AI usage" onRetry={() => void usage.refetch()} />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <ChartFrame
                title="AI requests per day"
                caption={
                  usage.data.estimatedRequests > 0
                    ? `${usage.data.estimatedRequests} requests had no provider-reported usage; their token counts are estimates (≈ 4 characters per token).`
                    : 'Token counts as reported by the provider.'
                }
                table={
                  <DataTable
                    headers={[
                      'Day (UTC)',
                      'Requests',
                      'Failed',
                      'Input tokens',
                      'Output tokens',
                      'Est. cost',
                    ]}
                    rows={usage.data.days.map((d) => [
                      d.day,
                      d.requests,
                      d.errors,
                      d.inputTokens,
                      d.outputTokens,
                      usd(d.costUsd),
                    ])}
                  />
                }
              >
                <LineChart
                  label="AI requests per day"
                  data={usage.data.days.map((d, i) => ({
                    x: i - (usage.data.days.length - 1),
                    y: d.requests,
                  }))}
                  xLabel="Days ago (UTC)"
                  yLabel="Requests"
                  formatY={(v) => String(Math.round(v))}
                  formatX={(v) => (v === 0 ? 'today' : String(Math.abs(v)))}
                />
              </ChartFrame>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By feature</CardTitle>
              </CardHeader>
              <CardContent>
                {usage.data.byFeature.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No AI requests in this period.</p>
                ) : (
                  <BarList
                    label="Requests by feature"
                    items={usage.data.byFeature.map((f) => ({
                      id: f.feature,
                      label: f.feature,
                      value: f.requests,
                      emphasized: true,
                      note: `${f.errors} failed · ${f.inputTokens} in / ${f.outputTokens} out tokens · ${usd(f.costUsd)}`,
                    }))}
                    format={(v) => String(v)}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By model</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Model
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Requests
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Est. cost
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {usage.data.byModel.map((m) => (
                      <tr key={`${m.provider}-${m.model}`}>
                        <td className="px-3 py-2">
                          {m.model}{' '}
                          <span className="text-xs text-muted-foreground">({m.provider})</span>{' '}
                          {m.isMock ? <Badge variant="warning">Mock</Badge> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.requests}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(m.costUsd)}</td>
                      </tr>
                    ))}
                    {usage.data.byModel.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-muted-foreground">
                          No AI requests in this period.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt catalogue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {prompts.data ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Prompt
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Version
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Purpose
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {prompts.data.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                    <td className="px-3 py-2 tabular-nums">v{p.version}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Skeleton className="m-4 h-24" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
