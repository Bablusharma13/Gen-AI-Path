'use client';

import { cn } from '@/lib/utils';
import { cellColors, useVizMode } from './palette';

/**
 * A matrix rendered as a real <table> with shaded cells — the chart and its table view in one.
 * Sequential (0..1): one blue hue, low values recede toward the surface. Diverging (-1..1):
 * blue for positive, red for negative, neutral gray at 0. Cell text picks whichever ink has the
 * higher measured contrast on that exact cell colour (always ≥ 4.5:1).
 */
export function HeatmapTable({
  caption,
  rowLabels,
  colLabels,
  values,
  scale,
  format = (v) => v.toFixed(2),
  highlightRow,
  highlightCols = [],
}: {
  caption: string;
  rowLabels: string[];
  colLabels: string[];
  values: (number | null)[][];
  scale: 'sequential' | 'diverging';
  format?: (v: number) => string;
  highlightRow?: number;
  highlightCols?: number[];
}) {
  const mode = useVizMode();
  // Avoid printing negative zero ("-0.0") for tiny negative values.
  const show = (v: number) => format(v).replace(/^-(0(?:\.0+)?)$/, '$1');
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="p-1">
              <span className="sr-only">Row</span>
            </th>
            {colLabels.map((c, j) => (
              <th
                key={j}
                scope="col"
                className={cn(
                  'max-w-16 truncate px-1 py-1 text-center font-medium text-muted-foreground',
                  highlightCols.includes(j) &&
                    'text-foreground underline decoration-2 underline-offset-4',
                )}
                title={c}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, i) => (
            <tr key={i}>
              <th
                scope="row"
                className={cn(
                  'max-w-24 truncate px-1 text-right font-medium text-muted-foreground',
                  highlightRow === i && 'text-foreground',
                )}
                title={rowLabels[i]}
              >
                {rowLabels[i]}
              </th>
              {row.map((v, j) => {
                const colors = cellColors(v, scale, mode);
                return (
                  <td
                    key={j}
                    className={cn(
                      'h-8 min-w-11 rounded px-1 text-center',
                      highlightRow === i && 'outline-2 -outline-offset-2 outline-foreground/50',
                      !colors && 'text-muted-foreground',
                    )}
                    style={colors ?? undefined}
                    title={`${rowLabels[i]} → ${colLabels[j]}: ${v === null ? 'masked' : show(v)}`}
                  >
                    {v === null ? '—' : show(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small scale legend for a heatmap. */
export function ScaleLegend({
  scale,
  low,
  high,
}: {
  scale: 'sequential' | 'diverging';
  low: string;
  high: string;
}) {
  const stops =
    scale === 'sequential'
      ? 'linear-gradient(to right, var(--viz-seq-low), var(--viz-seq-high))'
      : 'linear-gradient(to right, var(--viz-div-neg), var(--viz-div-mid), var(--viz-div-pos))';
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
      <span>{low}</span>
      <span className="h-2 w-24 rounded" style={{ background: stops }} />
      <span>{high}</span>
    </div>
  );
}
