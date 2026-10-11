'use client';

import { useMemo, useState } from 'react';
import { formatTick, linearScale, niceDomain, niceTicks } from './scales';

export interface ScatterPoint {
  x: number;
  y: number;
  /** Short direct label drawn beside the point (e.g. "S1"). */
  label?: string;
  /** Longer text for the tooltip. */
  detail?: string;
}

const W = 600;
const H = 300;
const M = { top: 16, right: 24, bottom: 38, left: 48 };

/**
 * Scatter with optional fitted line. Points use series 1 with a 2px surface ring and a 24px
 * invisible hit area; the optional line uses series 2. Every point is focusable.
 */
export function ScatterChart({
  label,
  points,
  line,
  xLabel,
  yLabel,
  showAxes = true,
}: {
  label: string;
  points: ScatterPoint[];
  line?: { x1: number; y1: number; x2: number; y2: number };
  xLabel?: string;
  yLabel?: string;
  showAxes?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);

  const g = useMemo(() => {
    const xs = points.map((p) => p.x).concat(line ? [line.x1, line.x2] : []);
    const ys = points.map((p) => p.y).concat(line ? [line.y1, line.y2] : []);
    const pad = (min: number, max: number): [number, number] => {
      const span = max - min || 1;
      return [min - span * 0.08, max + span * 0.08];
    };
    const xDomain = showAxes
      ? niceDomain(...pad(Math.min(...xs), Math.max(...xs)))
      : pad(Math.min(...xs), Math.max(...xs));
    const yDomain = showAxes
      ? niceDomain(...pad(Math.min(...ys), Math.max(...ys)))
      : pad(Math.min(...ys), Math.max(...ys));
    return {
      x: linearScale(xDomain, [M.left, W - M.right]),
      y: linearScale(yDomain, [H - M.bottom, M.top]),
      xTicks: niceTicks(xDomain[0], xDomain[1], 5).filter(
        (t) => t >= xDomain[0] && t <= xDomain[1],
      ),
      yTicks: niceTicks(yDomain[0], yDomain[1], 4).filter(
        (t) => t >= yDomain[0] && t <= yDomain[1],
      ),
    };
  }, [points, line, showAxes]);

  const activePoint = active !== null ? points[active] : undefined;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="group"
        aria-label={label}
      >
        {showAxes
          ? g.yTicks.map((t) => (
              <g key={`y${t}`}>
                <line
                  x1={M.left}
                  x2={W - M.right}
                  y1={g.y(t)}
                  y2={g.y(t)}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text
                  x={M.left - 8}
                  y={g.y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--viz-label)"
                >
                  {formatTick(t)}
                </text>
              </g>
            ))
          : null}
        {showAxes
          ? g.xTicks.map((t) => (
              <text
                key={`x${t}`}
                x={g.x(t)}
                y={H - M.bottom + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--viz-label)"
              >
                {formatTick(t)}
              </text>
            ))
          : null}
        {showAxes ? (
          <line
            x1={M.left}
            x2={W - M.right}
            y1={H - M.bottom}
            y2={H - M.bottom}
            stroke="var(--viz-axis)"
            strokeWidth={1}
          />
        ) : null}
        {xLabel ? (
          <text
            x={(M.left + W - M.right) / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize={11}
            fill="var(--viz-label)"
          >
            {xLabel}
          </text>
        ) : null}
        {yLabel ? (
          <text
            transform={`translate(12 ${(M.top + H - M.bottom) / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill="var(--viz-label)"
          >
            {yLabel}
          </text>
        ) : null}
        {line ? (
          <line
            x1={g.x(line.x1)}
            y1={g.y(line.y1)}
            x2={g.x(line.x2)}
            y2={g.y(line.y2)}
            stroke="var(--viz-series-2)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ) : null}
        {points.map((p, i) => (
          <g
            key={i}
            tabIndex={0}
            role="img"
            aria-label={`${p.label ? `${p.label}: ` : ''}${p.detail ?? `${formatTick(p.x)}, ${formatTick(p.y)}`}`}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="outline-none"
          >
            <circle cx={g.x(p.x)} cy={g.y(p.y)} r={12} fill="transparent" />
            <circle
              cx={g.x(p.x)}
              cy={g.y(p.y)}
              r={active === i ? 6 : 4.5}
              fill="var(--viz-series-1)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
            {p.label ? (
              <text
                x={g.x(p.x) + 9}
                y={g.y(p.y) - 7}
                fontSize={11}
                fontWeight={600}
                fill="currentColor"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {activePoint?.detail ? (
        <div
          role="status"
          className="pointer-events-none absolute max-w-60 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(g.x(activePoint.x) / W) * 100}%`,
            top: `${(g.y(activePoint.y) / H) * 100}%`,
            transform:
              g.x(activePoint.x) > W * 0.6
                ? 'translate(calc(-100% - 12px), -50%)'
                : 'translate(12px, -50%)',
          }}
        >
          {activePoint.label ? (
            <span className="block font-semibold">{activePoint.label}</span>
          ) : null}
          <span className="text-muted-foreground">{activePoint.detail}</span>
        </div>
      ) : null}
    </div>
  );
}
