'use client';

import { localHashEmbed } from '@genpath/ai-core';
import { analyseEmbeddings } from '@genpath/ai-core/labs';
import { useMutation } from '@tanstack/react-query';
import { Plus, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { BarList } from '@/components/viz/bar-list';
import { ChartFrame, DataTable } from '@/components/viz/chart-frame';
import { HeatmapTable, ScaleLegend } from '@/components/viz/heatmap-table';
import { ScatterChart } from '@/components/viz/scatter-chart';
import { api, errorMessage } from '@/lib/api';
import { useAiStatus } from '@/lib/mentor';

const DEFAULT_SENTENCES = [
  'The cat sat on the mat',
  'A kitten is sleeping on the rug',
  'Please pay the attached invoice',
  'Your payment is overdue',
];
const MAX_SENTENCES = 8;

export function EmbeddingsLab({ config }: { config: Record<string, unknown> }) {
  const initial = Array.isArray(config.sentences)
    ? (config.sentences as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, MAX_SENTENCES)
    : DEFAULT_SENTENCES;
  const [sentences, setSentences] = useState<string[]>(
    initial.length >= 2 ? initial : DEFAULT_SENTENCES,
  );

  // Recompute only when the text actually changes, not on every array identity change.
  const joined = sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\u0000');
  const filled = useMemo(() => (joined ? joined.split('\u0000') : []), [joined]);
  const aiStatus = useAiStatus();
  const semanticAvailable = aiStatus.data?.embeddings.semantic ?? false;
  // Provider embeddings are fetched on demand (each call uses the learner's AI quota).
  const provider = useMutation({
    mutationFn: (texts: string[]) =>
      api<{ vectors: number[][]; model: string; dimensions: number }>('/ai/lab-embeddings', {
        method: 'POST',
        body: { texts },
      }),
  });
  const providerResult =
    provider.data && JSON.stringify(provider.variables) === JSON.stringify(filled)
      ? provider.data
      : null;
  const analysis = useMemo(
    () =>
      filled.length >= 2
        ? analyseEmbeddings(
            providerResult ? providerResult.vectors : filled.map((s) => localHashEmbed(s)),
          )
        : null,
    [filled, providerResult],
  );
  const dimensions = providerResult?.dimensions ?? localHashEmbed('x').length;
  const labels = filled.map((_, i) => `S${i + 1}`);

  return (
    <div className="space-y-5">
      <ol className="space-y-2">
        {sentences.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-7 text-sm font-semibold text-muted-foreground">S{i + 1}</span>
            <Input
              aria-label={`Sentence ${i + 1}`}
              value={s}
              maxLength={200}
              onChange={(e) =>
                setSentences((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
              }
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove sentence ${i + 1}`}
              disabled={sentences.length <= 2}
              onClick={() => setSentences((prev) => prev.filter((_, j) => j !== i))}
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        disabled={sentences.length >= MAX_SENTENCES}
        onClick={() => setSentences((prev) => [...prev, ''])}
      >
        <Plus aria-hidden /> Add sentence
      </Button>

      {providerResult ? (
        <Alert tone="success" title={`Semantic embeddings from ${providerResult.model}`}>
          {providerResult.dimensions}-dimensional vectors from the configured embedding model. Edit
          a sentence to switch back to local embeddings, then compare.
        </Alert>
      ) : (
        <Alert
          tone="warning"
          title="Offline embeddings are lexical"
          action={
            semanticAvailable ? (
              <Button
                size="sm"
                variant="outline"
                disabled={provider.isPending || filled.length < 2}
                onClick={() => provider.mutate(filled)}
              >
                {provider.isPending ? <Spinner /> : <Sparkles aria-hidden />} Use real embeddings
              </Button>
            ) : undefined
          }
        >
          These vectors come from hashing words and word pieces, so “car” and “automobile” look
          unrelated. Real embedding models capture meaning; try “kitten” vs “cat” to see the limits.
          {provider.isError ? (
            <span className="mt-1 block text-destructive">{errorMessage(provider.error)}</span>
          ) : null}
        </Alert>
      )}

      {!analysis ? (
        <p className="text-sm text-muted-foreground">Enter at least two sentences.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartFrame
            title="Most similar pairs (cosine similarity)"
            table={
              <DataTable
                headers={['Pair', 'Cosine similarity']}
                rows={analysis.pairs.map((p) => [`S${p.a + 1} ↔ S${p.b + 1}`, p.score.toFixed(3)])}
              />
            }
          >
            <BarList
              label="Sentence pairs ranked by cosine similarity"
              max={1}
              items={analysis.pairs.slice(0, 8).map((p, i) => ({
                id: `${p.a}-${p.b}`,
                label: `S${p.a + 1} ↔ S${p.b + 1}`,
                value: Math.max(0, p.score),
                emphasized: i === 0,
                note: `${filled[p.a]} ↔ ${filled[p.b]}`,
              }))}
              format={(v) => v.toFixed(2)}
            />
          </ChartFrame>

          <ChartFrame
            title="2D projection (PCA)"
            caption={
              <span className="inline-flex gap-1">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                These two axes keep {Math.round(analysis.explainedVariance * 100)}% of the variation
                in the {dimensions}
                -dimensional vectors — distances on this plot are approximate.
              </span>
            }
            table={
              <DataTable
                headers={['Sentence', 'PC1', 'PC2']}
                rows={analysis.points.map((p, i) => [
                  `S${i + 1}: ${filled[i]}`,
                  p[0].toFixed(3),
                  p[1].toFixed(3),
                ])}
              />
            }
          >
            <ScatterChart
              label="Sentences projected to two dimensions"
              points={analysis.points.map((p, i) => ({
                x: p[0],
                y: p[1],
                label: labels[i],
                detail: filled[i],
              }))}
              showAxes={false}
            />
          </ChartFrame>

          <div className="space-y-2 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Similarity matrix</p>
              <ScaleLegend scale="diverging" low="−1 opposite" high="+1 same direction" />
            </div>
            <HeatmapTable
              caption="Cosine similarity between every pair of sentences"
              rowLabels={labels}
              colLabels={labels}
              values={analysis.similarity}
              scale="diverging"
            />
          </div>
        </div>
      )}
    </div>
  );
}
