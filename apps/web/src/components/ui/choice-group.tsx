'use client';

import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Choice<T extends string | number> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
}

interface BaseProps<T extends string | number> {
  legend: string;
  hint?: ReactNode;
  choices: Choice<T>[];
  columns?: 1 | 2 | 3;
  className?: string;
}

const gridCols = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as const;

function CardFace({
  checked,
  title,
  description,
}: {
  checked: boolean;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex h-full items-start gap-3 rounded-lg border p-3 text-left transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-ring',
        checked ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        {description ? (
          <span className="block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </span>
  );
}

/** Accessible radio-card group built on native radio inputs. */
export function RadioCards<T extends string | number>({
  legend,
  hint,
  choices,
  value,
  onChange,
  columns = 2,
  className,
}: BaseProps<T> & { value: T | null; onChange: (value: T) => void }) {
  const name = useId();
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint ? <p className="-mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className={cn('grid gap-2', gridCols[columns])}>
        {choices.map((choice) => {
          const checked = value === choice.value;
          return (
            <label key={String(choice.value)} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                className="peer sr-only"
                checked={checked}
                onChange={() => onChange(choice.value)}
              />
              <CardFace checked={checked} title={choice.title} description={choice.description} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Accessible multi-select card group built on native checkboxes. */
export function CheckboxCards<T extends string | number>({
  legend,
  hint,
  choices,
  values,
  onChange,
  columns = 3,
  className,
}: BaseProps<T> & { values: T[]; onChange: (values: T[]) => void }) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint ? <p className="-mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className={cn('grid gap-2', gridCols[columns])}>
        {choices.map((choice) => {
          const checked = values.includes(choice.value);
          return (
            <label key={String(choice.value)} className="cursor-pointer">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked ? values.filter((v) => v !== choice.value) : [...values, choice.value],
                  )
                }
              />
              <CardFace checked={checked} title={choice.title} description={choice.description} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
