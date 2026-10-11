'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatTick, linearScale, logScale, logTicks, niceDomain, niceTicks } from './scales';

export interface LinePoint {
  x: number;
  y: number;
}

const W = 600;
const H = 240;
const M = { top: 14, right: 64, bottom: 38, left: 52 };

/**
 * Single-series line chart: 2px line, hairline grid, value at the end, crosshair + tooltip on
 * hover and keyboard focus (arrow keys move it). Values are also available in the table view.
 */
export function LineChart({
  label,
  data,
  xLabel,
  yLabel,
  logY = false,
  formatY = formatTick,
  formatX = formatTick,
}: {
  label: string;
  data: LinePoint[];
  xLabel: string;
  yLabel: string;
  logY?: boolean;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipId = useId();

  const geometry = useMemo(() => {
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const xDomain: [number, number] = [Math.min(...xs), Math.max(...xs, Math.min(...xs) + 1)];
    let yDomain: [number, number];
    let yTicks: number[];
    if (logY) {
      const positive = ys.filter((y) => y > 0);
      const lo = 10 ** Math.floor(Math.log10(Math.min(...positive, 1)));
      const hi = 10 ** Math.ceil(Math.log10(Math.max(...positive, lo * 10)));
      yDomain = [lo, hi];
      yTicks = logTicks(lo, hi);
    } else {
      yDomain = niceDomain(Math.min(0, ...ys), Math.max(...ys, 1));
      yTicks = niceTicks(yDomain[0], yDomain[1], 4);
    }
    const x = linearScale(xDomain, [M.left, W - M.right]);
    const y = (logY ? logScale : linearScale)(yDomain, [H - M.bottom, M.top]);
    const path = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d.x).toFixed(2)},${y(d.y).toFixed(2)}`)
      .join(' ');
    return { x, y, xTicks: niceTicks(xDomain[0], xDomain[1], 6), yTicks, path, xDomain };
  }, [data, logY]);

  if (data.length === 0) return null;
  const { x, y } = geometry;
  const last = data[data.length - 1]!;
  const point = active !== null ? data[active] : undefined;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < data.length; i += 1) {
      if (Math.abs(x(data[i]!.x) - vx) < Math.abs(x(data[best]!.x) - vx)) best = i;
    }
    setActive(best);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const current = active ?? data.length - 1;
    const next =
      e.key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : e.key === 'ArrowRight'
          ? Math.min(data.length - 1, current + 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? data.length - 1
              : null;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none focus-visible:outline-2 focus-visible:outline-ring"
        role="img"
        aria-label={`${label}. Use left and right arrow keys to read values.`}
        aria-describedby={point ? tooltipId : undefined}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(data.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {geometry.yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
            <text
              x={M.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--viz-label)"
            >
              {formatY(t)}
            </text>
          </g>
        ))}
        {geometry.xTicks
          .filter((t) => t >= geometry.xDomain[0] && t <= geometry.xDomain[1])
          .map((t) => (
            <text
              key={`x${t}`}
              x={x(t)}
              y={H - M.bottom + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--viz-label)"
            >
              {formatX(t)}
            </text>
          ))}
        <line
          x1={M.left}
          x2={W - M.right}
          y1={H - M.bottom}
          y2={H - M.bottom}
          stroke="var(--viz-axis)"
          strokeWidth={1}
        />
        <text
          x={(M.left + W - M.right) / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize={11}
          fill="var(--viz-label)"
        >
          {xLabel}
        </text>
        <text
          transform={`translate(12 ${(M.top + H - M.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={11}
          fill="var(--viz-label)"
        >
          {yLabel}
        </text>
        <path
          d={geometry.path}
          fill="none"
          stroke="var(--viz-series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(last.x)}
          cy={y(last.y)}
          r={4}
          fill="var(--viz-series-1)"
          stroke="var(--viz-surface)"
          strokeWidth={2}
        />
        <text
          x={x(last.x) + 8}
          y={y(last.y)}
          dominantBaseline="middle"
          fontSize={11}
          fill="currentColor"
        >
          {formatY(last.y)}
        </text>
        {point ? (
          <g pointerEvents="none">
            <line
              x1={x(point.x)}
              x2={x(point.x)}
              y1={M.top}
              y2={H - M.bottom}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
            <circle
              cx={x(point.x)}
              cy={y(point.y)}
              r={5}
              fill="var(--viz-series-1)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          </g>
        ) : null}
      </svg>
      {point ? (
        <div
          id={tooltipId}
          role="status"
          className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(x(point.x) / W) * 100}%`,
            transform: x(point.x) > W * 0.6 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <span className="block text-sm font-semibold">{formatY(point.y)}</span>
          <span className="text-muted-foreground">
            {yLabel} at {xLabel.toLowerCase()} {formatX(point.x)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
