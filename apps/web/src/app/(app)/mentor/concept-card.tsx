'use client';

import { Lightbulb } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useExplain } from '@/lib/mentor';

/** Structured "study card" explanation (validated JSON from the mentor). */
export function ConceptCardDialog({ lessonId }: { lessonId?: string | undefined }) {
  const explain = useExplain();
  const [concept, setConcept] = useState('');
  const id = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (concept.trim().length >= 2)
      explain.mutate({ concept: concept.trim(), ...(lessonId ? { lessonId } : {}) });
  };

  const card = explain.data;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Lightbulb aria-hidden /> Concept card
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader
          title="Explain a concept"
          description="Get a compact study card: summary, analogy, example and a check question."
        />
        <form onSubmit={onSubmit} className="flex gap-2">
          <label htmlFor={id} className="sr-only">
            Concept
          </label>
          <Input
            id={id}
            value={concept}
            maxLength={300}
            placeholder="e.g. cosine similarity"
            onChange={(e) => setConcept(e.target.value)}
          />
          <Button type="submit" disabled={explain.isPending || concept.trim().length < 2}>
            {explain.isPending ? <Spinner /> : null} Explain
          </Button>
        </form>
        {explain.isError ? (
          <Alert tone="error" className="mt-4">
            {errorMessage(explain.error)}
          </Alert>
        ) : null}
        {card ? (
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{card.title}</h3>
              {card.isMock ? <Badge variant="warning">Mock AI</Badge> : null}
            </div>
            <Markdown>{card.summary}</Markdown>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="mb-1 text-xs font-semibold text-primary">Analogy</p>
              <Markdown>{card.analogy}</Markdown>
            </div>
            {card.example ? (
              <Markdown>{`\`\`\`${card.example.language.replace(/[^a-z0-9+#-]/gi, '')}\n${card.example.code}\n\`\`\``}</Markdown>
            ) : null}
            <p>
              <span className="font-medium">Check yourself: </span>
              {card.checkQuestion}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Common mistake: </span>
              {card.commonMistake}
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
