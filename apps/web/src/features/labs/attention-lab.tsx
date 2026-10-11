'use client';

import {
  attentionConfigSchema,
  attentionSteps,
  computeAttention,
  D_HEAD,
  D_MODEL,
} from '@genpath/ai-core/labs';
import type { LabStep } from '@genpath/shared';
import { useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BarList } from '@/components/viz/bar-list';
import { HeatmapTable, ScaleLegend } from '@/components/viz/heatmap-table';
import { cn } from '@/lib/utils';
import { StepPlayer } from './step-player';

function TokenRow({
  tokens,
  highlights,
  focus,
}: {
  tokens: string[];
  highlights: string[];
  focus: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Tokens">
      {tokens.map((t, i) => (
        <span
          key={i}
          className={cn(
            'rounded-md border px-2 py-1 font-mono text-sm',
            i === focus && 'border-primary bg-primary text-primary-foreground',
            i !== focus && highlights.includes(`token-${i}`) && 'border-primary bg-primary/10',
          )}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

const dims = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

export function AttentionLab({ config }: { config: Record<string, unknown> }) {
  const [base] = useState(() => {
    const parsed = attentionConfigSchema.safeParse(config);
    return parsed.success ? parsed.data : attentionConfigSchema.parse({});
  });
  const [sentence, setSentence] = useState(base.sentence);
  const [causal, setCausal] = useState(base.causal);
  const [focus, setFocus] = useState(base.focus);
  const ids = { sentence: useId(), causal: useId() };

  const result = useMemo(
    () => computeAttention({ sentence: sentence.trim() || 'Hello world', causal }),
    [sentence, causal],
  );
  const focusIndex = Math.min(focus, result.tokens.length - 1);
  const steps = useMemo(() => attentionSteps(result, focusIndex), [result, focusIndex]);

  const row = (values: number[] | undefined) =>
    (values ?? []).map((v) => (Number.isFinite(v) ? v : null));
  const scaleRow = (values: (number | null)[]) => {
    const max = Math.max(1e-9, ...values.filter((v): v is number => v !== null).map(Math.abs));
    return values.map((v) => (v === null ? null : v / max));
  };

  const render = (step: LabStep) => {
    const tokensView = (
      <TokenRow tokens={result.tokens} highlights={step.highlights} focus={focusIndex} />
    );
    switch (step.id) {
      case 'tokens':
        return (
          <div className="space-y-3">
            {tokensView}
            <HeatmapTable
              caption={`Toy ${D_MODEL}-dimensional embeddings`}
              rowLabels={result.tokens}
              colLabels={dims(D_MODEL, 'd')}
              values={result.embeddings}
              scale="diverging"
              highlightRow={focusIndex}
            />
          </div>
        );
      case 'qkv':
        return (
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['Queries (Q)', result.queries],
                ['Keys (K)', result.keys],
                ['Values (V)', result.values],
              ] as const
            ).map(([title, m]) => (
              <div key={title} className="space-y-1">
                <p className="text-xs font-medium">{title}</p>
                <HeatmapTable
                  caption={title}
                  rowLabels={result.tokens}
                  colLabels={dims(D_HEAD, '')}
                  values={m.map((r) => scaleRow(r))}
                  scale="diverging"
                  highlightRow={focusIndex}
                  format={(v) => v.toFixed(1)}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground md:col-span-3">
              Colours are scaled per row for readability.
            </p>
          </div>
        );
      case 'scores':
      case 'scale': {
        const values = row(
          step.id === 'scores' ? result.scores[focusIndex] : result.scaled[focusIndex],
        );
        return (
          <div className="space-y-3">
            {tokensView}
            <HeatmapTable
              caption={step.title}
              rowLabels={[result.tokens[focusIndex] ?? '']}
              colLabels={result.tokens}
              values={[values.map((v) => v)]}
              scale="diverging"
              format={(v) => v.toFixed(2)}
            />
            <p className="text-xs text-muted-foreground">
              Raw values are shown; colour intensity is relative to the largest magnitude in the
              row.
            </p>
          </div>
        );
      }
      case 'softmax':
        return (
          <div className="space-y-3">
            {tokensView}
            <BarList
              label={`Attention weights for ${result.tokens[focusIndex]}`}
              max={1}
              items={(result.weights[focusIndex] ?? []).map((w, j) => ({
                id: `w-${j}`,
                label: `${j}: ${result.tokens[j]}`,
                value: w,
                emphasized: step.highlights.includes(`token-${j}`),
              }))}
            />
          </div>
        );
      case 'output':
        return (
          <div className="space-y-3">
            {tokensView}
            <HeatmapTable
              caption="New representation"
              rowLabels={[`out(${result.tokens[focusIndex]})`]}
              colLabels={dims(D_HEAD, '')}
              values={[scaleRow(row(result.outputs[focusIndex]))]}
              scale="diverging"
            />
          </div>
        );
      default:
        return (
          <div className="space-y-2">
            <ScaleLegend scale="sequential" low="0" high="1" />
            <HeatmapTable
              caption="Attention weights: rows attend to columns"
              rowLabels={result.tokens}
              colLabels={result.tokens}
              values={result.weights.map((r) => r.map((v) => (causal && v === 0 ? null : v)))}
              scale="sequential"
              highlightRow={focusIndex}
            />
          </div>
        );
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <label htmlFor={ids.sentence} className="text-sm font-medium">
            Sentence (up to 10 tokens)
          </label>
          <Input
            id={ids.sentence}
            value={sentence}
            maxLength={120}
            onChange={(e) => setSentence(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-3 pb-2">
          <label htmlFor={ids.causal} className="text-sm">
            Causal mask (decoder)
          </label>
          <Switch id={ids.causal} checked={causal} onCheckedChange={setCausal} />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Focus token</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Focus token">
          {result.tokens.map((t, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === focusIndex}
              onClick={() => setFocus(i)}
              className={cn(
                'cursor-pointer rounded-md border px-2 py-1 font-mono text-sm',
                i === focusIndex
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <StepPlayer
        key={`${sentence}-${causal}-${focusIndex}`}
        steps={steps}
        render={render}
        label="Attention walkthrough"
      />
    </div>
  );
}
