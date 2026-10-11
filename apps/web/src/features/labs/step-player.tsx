'use client';

import { labStepsSchema, type LabStep } from '@genpath/shared';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const BASE_MS = 2600;

/**
 * Deterministic step player. Steps are validated against the shared LabStep schema before
 * rendering; the lab decides how each step is drawn via `render`.
 */
export function StepPlayer({
  steps,
  render,
  label,
}: {
  steps: LabStep[];
  render: (step: LabStep, index: number) => ReactNode;
  label: string;
}) {
  const validation = useMemo(() => labStepsSchema.safeParse(steps), [steps]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const speedId = useId();
  const count = steps.length;
  const current = Math.min(index, count - 1);

  useEffect(() => {
    if (!playing) return;
    if (current >= count - 1) {
      const stop = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(stop);
    }
    const timer = setTimeout(() => setIndex(current + 1), BASE_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, current, count, speed]);

  if (!validation.success) {
    return (
      <Alert tone="error" title="This lab produced invalid steps">
        The visualisation was blocked for safety.
      </Alert>
    );
  }
  const step = steps[current]!;

  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(current + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(current - 1);
    }
  };

  return (
    <div className="space-y-3" role="region" aria-label={label} onKeyDown={onKeyDown}>
      <ol className="flex gap-1" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.id} className="flex-1">
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                go(i);
              }}
              aria-current={i === current ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${s.title}`}
              className={cn(
                'h-1.5 w-full cursor-pointer rounded-full transition-colors',
                i < current ? 'bg-primary/60' : i === current ? 'bg-primary' : 'bg-muted',
              )}
            />
          </li>
        ))}
      </ol>

      <div aria-live="polite">
        <p className="text-xs font-medium text-muted-foreground">
          Step {current + 1} of {count} · {step.stage}
        </p>
        <h4 className="font-semibold">{step.title}</h4>
        <p className="text-sm text-muted-foreground">{step.description}</p>
      </div>

      <div className="min-h-24">{render(step, current)}</div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous step"
          onClick={() => go(current - 1)}
          disabled={current === 0}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (!playing && current >= count - 1) setIndex(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          {playing ? 'Pause' : current >= count - 1 ? 'Replay' : 'Play'}
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next step"
          onClick={() => go(current + 1)}
          disabled={current === count - 1}
        >
          <ChevronRight aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
        >
          <SkipBack aria-hidden /> Reset
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIndex(0);
            setPlaying(true);
          }}
        >
          <RotateCcw aria-hidden /> Replay
        </Button>
        <label htmlFor={speedId} className="ml-auto text-xs text-muted-foreground">
          Speed
        </label>
        <NativeSelect
          id={speedId}
          className="h-8 w-20 text-xs"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </NativeSelect>
      </div>

      <details className="rounded-md border text-xs">
        <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground">
          Inspect state (JSON)
        </summary>
        <pre className="max-h-64 overflow-auto border-t bg-muted/40 p-3 font-mono">
          {JSON.stringify(step.state, null, 2)}
        </pre>
      </details>
    </div>
  );
}
