'use client';

import { Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Chart container: title, optional caption, the chart, and a table-view toggle — the
 * accessible twin every chart ships with.
 */
export function ChartFrame({
  title,
  caption,
  table,
  legend,
  children,
}: {
  title: string;
  caption?: ReactNode;
  table: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showTable}
          onClick={() => setShowTable((v) => !v)}
        >
          <Table2 aria-hidden /> {showTable ? 'Hide table' : 'Table'}
        </Button>
      </div>
      {legend}
      {showTable ? (
        <div className="max-h-72 overflow-auto rounded-md border text-xs">{table}</div>
      ) : (
        children
      )}
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
    </figure>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse tabular-nums">
      <thead className="sticky top-0 bg-muted">
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col" className="px-2 py-1 text-left font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t">
            {row.map((cell, j) => (
              <td key={j} className="px-2 py-1">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LegendItem({
  color,
  label,
  shape = 'line',
}: {
  color: string;
  label: string;
  shape?: 'line' | 'dot';
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {shape === 'line' ? (
        <span
          aria-hidden
          className="inline-block h-0.5 w-4 rounded"
          style={{ background: color }}
        />
      ) : (
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  );
}
