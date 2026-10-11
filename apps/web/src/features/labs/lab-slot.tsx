'use client';

import type { ExplanationLanguage, LessonDto } from '@genpath/shared';
import { FlaskConical, Info } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { tx } from '@/lib/localize';
import { LAB_META } from './meta';

// Labs are heavy (tokenizer tables, charts): load them only when a lesson shows one.
const LabRenderer = dynamic(() => import('./lab-renderer').then((m) => m.LabRenderer), {
  ssr: false,
  loading: () => <Skeleton className="h-72" />,
});

/** Embeds an interactive lab inside a lesson, with its honesty note always visible. */
export function LabSlot({
  lab,
  lang,
}: {
  lab: NonNullable<LessonDto['lab']>;
  lang: ExplanationLanguage;
}) {
  const meta = LAB_META[lab.id];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4 text-primary" aria-hidden /> Lab: {meta.title}
        </CardTitle>
        {lab.prompt ? (
          <p className="text-sm text-muted-foreground">{tx(lab.prompt, lang)}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <LabRenderer id={lab.id} config={lab.config} />
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {meta.honesty}
        </p>
      </CardContent>
    </Card>
  );
}
