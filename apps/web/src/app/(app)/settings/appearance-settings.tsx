'use client';

import { THEME_LABELS, THEMES, type ProfileDto } from '@genpath/shared';
import { useTheme } from 'next-themes';
import { useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioCards } from '@/components/ui/choice-group';
import { Switch } from '@/components/ui/switch';
import { applyAccessibility, useUpdatePreferences } from '@/lib/preferences';

const FONT_SCALES = [
  { value: 1, title: 'Default' },
  { value: 1.125, title: 'Large' },
  { value: 1.25, title: 'Extra large' },
] as const;

export function AppearanceSettings({ profile }: { profile: ProfileDto }) {
  const update = useUpdatePreferences();
  const { setTheme } = useTheme();
  const motionId = useId();
  const p = profile.preferences;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Saved to your account and applied on every device.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioCards
            legend="Color theme"
            columns={3}
            value={p.theme}
            onChange={(theme) => {
              setTheme(theme);
              update.mutate({ theme });
            }}
            choices={THEMES.map((t) => ({ value: t, title: THEME_LABELS[t] }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Accessibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioCards
            legend="Text size"
            columns={3}
            value={p.fontScale}
            onChange={(fontScale) => {
              applyAccessibility({ ...p, fontScale });
              update.mutate({ fontScale });
            }}
            choices={FONT_SCALES.map((s) => ({ value: s.value, title: s.title }))}
          />
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <label htmlFor={motionId} className="text-sm font-medium">
                Reduce motion
              </label>
              <p className="text-sm text-muted-foreground">
                Turns off animations in labs and transitions. Your OS setting is always respected
                too.
              </p>
            </div>
            <Switch
              id={motionId}
              checked={p.reducedMotion}
              onCheckedChange={(reducedMotion) => {
                applyAccessibility({ ...p, reducedMotion });
                update.mutate({ reducedMotion });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
