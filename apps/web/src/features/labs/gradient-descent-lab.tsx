'use client';

import { gradientDescentConfigSchema, runGradientDescent } from '@genpath/ai-core/labs';
import { useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/feedback';
import { ChartFrame, DataTable, LegendItem } from '@/components/viz/chart-frame';
import { LineChart } from '@/components/viz/line-chart';
import { ScatterChart } from '@/components/viz/scatter-chart';

const RATES = [0.005, 0.01, 0.02, 0.05, 0.08, 0.1, 0.2, 0.3] as const;

export function GradientDescentLab({ config }: { config: Record<string, unknown> }) {
  // Parsed once per mount; invalid lesson config falls back to the defaults.
  const [start] = useState(() => {
    const parsed = gradientDescentConfigSchema.safeParse(config);
    return parsed.success ? parsed.data : gradientDescentConfigSchema.parse({});
  });
  const [learningRate, setLearningRate] = useState(start.learningRate);
  const [steps, setSteps] = useState(start.steps);
  const [step, setStep] = useState<number | null>(null);
  const rateId = useId();
  const stepsId = useId();

  const result = useMemo(
    () => runGradientDescent({ ...start, learningRate, steps }),
    [start, learningRate, steps],
  );
  const shown =
    result.history[Math.min(step ?? result.history.length - 1, result.history.length - 1)]!;
  const xs = result.points.map(([x]) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={rateId} className="text-sm font-medium">
            Learning rate: <span className="tabular-nums">{learningRate}</span>
          </label>
          <input
            id={rateId}
            type="range"
            min={0}
            max={RATES.length - 1}
            step={1}
            value={Math.max(
              0,
              RATES.findIndex((r) => r >= learningRate),
            )}
            onChange={(e) => {
              setLearningRate(RATES[Number(e.target.value)] ?? 0.05);
              setStep(null);
            }}
            className="w-full accent-[var(--color-primary)]"
            aria-valuetext={`${learningRate}`}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={stepsId} className="text-sm font-medium">
            Training steps: <span className="tabular-nums">{steps}</span>
          </label>
          <input
            id={stepsId}
            type="range"
            min={5}
            max={200}
            step={5}
            value={steps}
            onChange={(e) => {
              setSteps(Number(e.target.value));
              setStep(null);
            }}
            className="w-full accent-[var(--color-primary)]"
          />
        </div>
      </div>

      {result.diverged ? (
        <Alert tone="warning" title="Training diverged">
          With learning rate {learningRate}, each step overshoots the minimum and the loss explodes.
          Lower the learning rate.
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">step {shown.step}</Badge>
        <Badge variant="outline">w = {shown.w.toFixed(3)}</Badge>
        <Badge variant="outline">b = {shown.b.toFixed(3)}</Badge>
        <Badge variant="outline">loss = {shown.loss.toPrecision(4)}</Badge>
        <Badge variant="secondary">
          best possible: w = {result.optimum.w.toFixed(3)}, b = {result.optimum.b.toFixed(3)}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="Loss over training steps"
          caption="Log scale: each gridline is 10× the one below. Hover or use arrow keys on the chart."
          table={
            <DataTable
              headers={['Step', 'Loss', 'w', 'b']}
              rows={result.history.map((h) => [
                h.step,
                h.loss.toPrecision(5),
                h.w.toFixed(4),
                h.b.toFixed(4),
              ])}
            />
          }
        >
          <LineChart
            label="Mean squared error by training step"
            data={result.history.map((h) => ({ x: h.step, y: h.loss }))}
            xLabel="Step"
            yLabel="Loss"
            logY
            formatY={(v) =>
              v >= 0.01 && v < 10_000 ? Number(v.toPrecision(3)).toString() : v.toExponential(1)
            }
          />
        </ChartFrame>
        <ChartFrame
          title={`Data and the line after step ${shown.step}`}
          legend={
            <div className="flex gap-4">
              <LegendItem color="var(--viz-series-1)" label="Data points" shape="dot" />
              <LegendItem color="var(--viz-series-2)" label="Model: y = w·x + b" />
            </div>
          }
          table={
            <DataTable
              headers={['x', 'y', 'prediction']}
              rows={result.points.map(([x, y]) => [x, y, (shown.w * x + shown.b).toFixed(3)])}
            />
          }
        >
          <ScatterChart
            label="Training data with the current fitted line"
            points={result.points.map(([x, y]) => ({ x, y, detail: `x = ${x}, y = ${y}` }))}
            line={{
              x1: minX,
              y1: shown.w * minX + shown.b,
              x2: maxX,
              y2: shown.w * maxX + shown.b,
            }}
            xLabel="x"
            yLabel="y"
          />
        </ChartFrame>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${stepsId}-scrub`} className="text-sm font-medium">
          Replay training: step {shown.step}
        </label>
        <input
          id={`${stepsId}-scrub`}
          type="range"
          min={0}
          max={result.history.length - 1}
          value={step ?? result.history.length - 1}
          onChange={(e) => setStep(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
      </div>
    </div>
  );
}
