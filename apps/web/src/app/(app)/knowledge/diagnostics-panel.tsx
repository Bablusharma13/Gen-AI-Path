'use client';

import { CheckCircle2, Search, XCircle } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState, Spinner } from '@/components/ui/feedback';
import { Input, Label } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useDiagnostics } from '@/lib/knowledge';

/** Admin tool: see exactly what retrieval returns for a query, with scores, before any model is involved. */
export function DiagnosticsPanel({ orgId }: { orgId: string }) {
  const diag = useDiagnostics(orgId);
  const [q, setQ] = useState('');
  const id = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 3) diag.mutate(q.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retrieval check</CardTitle>
        <CardDescription>
          Shows the top passages for a query with their scores — including those below the threshold
          — so you can tune documents and the threshold with real questions. No AI model is called.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1 space-y-1.5">
            <Label htmlFor={id}>Test query</Label>
            <Input
              id={id}
              value={q}
              maxLength={500}
              onChange={(e) => setQ(e.target.value)}
              placeholder="A question your members ask"
            />
          </div>
          <Button type="submit" disabled={diag.isPending || q.trim().length < 3}>
            {diag.isPending ? <Spinner label="Searching" /> : <Search aria-hidden />} Run
          </Button>
        </form>
        {diag.isError ? <Alert tone="error">{errorMessage(diag.error)}</Alert> : null}
        {diag.data ? (
          diag.data.results.length === 0 ? (
            <EmptyState icon={Search} title="No passages indexed yet" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
                  Score = 0.7 × vector similarity + 0.3 × keyword overlap. Threshold{' '}
                  {diag.data.minScore}.
                </caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Passage
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Score
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Vector
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Keyword
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Used?
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {diag.data.results.map((r) => (
                    <tr
                      key={r.chunkId}
                      className={r.passesThreshold ? undefined : 'text-muted-foreground'}
                    >
                      <td className="max-w-md px-3 py-2">
                        <p className="font-medium text-foreground">
                          {r.documentTitle}
                          {r.headingPath.length ? (
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              › {r.headingPath.join(' › ')}
                            </span>
                          ) : null}{' '}
                          {r.visibility === 'admins' ? (
                            <Badge variant="warning">Admins only</Badge>
                          ) : null}
                        </p>
                        <p className="line-clamp-2 whitespace-pre-wrap text-xs">{r.excerpt}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.score.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.vectorScore.toFixed(3)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.keywordScore.toFixed(3)}
                      </td>
                      <td className="px-3 py-2">
                        {r.passesThreshold ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <CheckCircle2 className="size-4" aria-hidden /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <XCircle className="size-4" aria-hidden /> Below threshold
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
