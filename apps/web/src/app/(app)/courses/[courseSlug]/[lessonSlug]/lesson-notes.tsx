'use client';

import { Check, NotebookPen } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/input';
import { useSaveNotes } from '@/lib/curriculum';

const MAX = 10_000;

/** Private notes with debounced autosave. */
export function LessonNotes({ lessonId, initial }: { lessonId: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const save = useSaveNotes(lessonId);
  const { mutate } = save;
  const id = useId();

  useEffect(() => {
    if (notes === saved || notes.length > MAX) return;
    const timer = setTimeout(() => {
      mutate(notes, { onSuccess: () => setSaved(notes) });
    }, 900);
    return () => clearTimeout(timer);
  }, [notes, saved, mutate]);

  const dirty = notes !== saved;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-4" aria-hidden />
          <label htmlFor={id}>My notes</label>
        </CardTitle>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {save.isPending ? (
            <span className="inline-flex items-center gap-1">
              <Spinner className="size-3" /> Saving
            </span>
          ) : save.isError ? (
            <span className="text-destructive">Not saved — will retry on next edit</span>
          ) : dirty ? (
            'Unsaved'
          ) : saved ? (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3" aria-hidden /> Saved
            </span>
          ) : null}
        </span>
      </CardHeader>
      <CardContent>
        <Textarea
          id={id}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Private to you. Write what clicked, what confused you, or questions for the mentor."
          className="min-h-32"
          maxLength={MAX}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {notes.length.toLocaleString()}/{MAX.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
