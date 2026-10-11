'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';

const ORDER = ['system', 'light', 'dark'] as const;
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Cycles system → light → dark. Signed-in users also persist the choice to their profile. */
export function ThemeToggle({ onChange }: { onChange?: (theme: (typeof ORDER)[number]) => void }) {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();

  const current = (
    mounted && ORDER.includes(theme as (typeof ORDER)[number]) ? theme : 'system'
  ) as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system';
  const Icon = ICONS[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${current}. Switch to ${next}`}
      title={`Theme: ${current}`}
      onClick={() => {
        setTheme(next);
        onChange?.(next);
      }}
    >
      <Icon aria-hidden />
    </Button>
  );
}
