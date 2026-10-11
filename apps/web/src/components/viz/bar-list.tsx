/**
 * Horizontal bars with emphasis: highlighted items use series 1, the rest the de-emphasis gray.
 * Bars are ≤ 16px thick with a 4px rounded data end, square at the baseline, and every value is
 * printed at the bar tip in text ink (never in the bar colour) — no tooltip needed to read it.
 */
export function BarList({
  label,
  items,
  max,
  format = (v) => v.toFixed(2),
}: {
  label: string;
  items: { id: string; label: string; value: number; emphasized: boolean; note?: string }[];
  max?: number;
  format?: (v: number) => string;
}) {
  const domainMax = max ?? Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <ul aria-label={label} className="space-y-1.5">
      {items.map((item) => {
        const width = Math.max(0, Math.min(1, item.value / domainMax)) * 100;
        return (
          <li
            key={item.id}
            className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-xs"
          >
            <span className="truncate text-muted-foreground" title={item.note ?? item.label}>
              {item.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="relative h-4 flex-1">
                <span
                  className="absolute inset-y-0 left-0 rounded-r"
                  style={{
                    width: `${width}%`,
                    background: item.emphasized ? 'var(--viz-series-1)' : 'var(--viz-deemph)',
                  }}
                />
              </span>
              <span
                className={
                  item.emphasized
                    ? 'w-12 font-semibold tabular-nums'
                    : 'w-12 tabular-nums text-muted-foreground'
                }
              >
                {format(item.value)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
