'use client';

import {
  PROGRAMMING_LANGUAGE_LABELS,
  type CodeExample,
  type ExplanationLanguage,
  type ProgrammingLanguage,
} from '@genpath/shared';
import { Check, Copy, Info } from 'lucide-react';
import { useState } from 'react';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { CODE_LANGUAGE_ORDER, pickVariant, tx } from '@/lib/localize';
import { cn } from '@/lib/utils';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? 'Copied' : 'Copy code'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

function ExampleBlock({
  example,
  lang,
  preferred,
}: {
  example: CodeExample;
  lang: ExplanationLanguage;
  preferred: ProgrammingLanguage;
}) {
  const initial = pickVariant(example.variants, preferred);
  const [selected, setSelected] = useState<ProgrammingLanguage | null>(initial?.language ?? null);
  const available = CODE_LANGUAGE_ORDER.filter((l) => example.variants[l]);
  if (!selected) return null;
  const code = example.variants[selected] ?? '';
  const showFallbackNotice = initial?.fallback && selected === initial.language;

  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <span className="text-sm font-medium">{tx(example.title, lang)}</span>
        <div className="flex items-center gap-1" role="tablist" aria-label="Code language">
          {available.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={selected === l}
              onClick={() => setSelected(l)}
              className={cn(
                'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                selected === l
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {PROGRAMMING_LANGUAGE_LABELS[l]}
            </button>
          ))}
          <CopyButton text={code} />
        </div>
      </figcaption>
      {showFallbackNotice ? (
        <p className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          No {PROGRAMMING_LANGUAGE_LABELS[preferred]} version of this example yet — showing{' '}
          {PROGRAMMING_LANGUAGE_LABELS[selected]}. Your language preference is unchanged.
        </p>
      ) : null}
      {example.description ? (
        <div className="border-b px-4 py-2 text-sm text-muted-foreground">
          <Markdown>{tx(example.description, lang)}</Markdown>
        </div>
      ) : null}
      <div className="[&_pre]:m-0 [&_pre]:rounded-none [&_pre]:border-0 [&_pre]:bg-transparent">
        <Markdown>{`\`\`\`${selected}\n${code.trimEnd()}\n\`\`\``}</Markdown>
      </div>
      {example.expectedOutput && selected === 'python' ? (
        <details className="border-t">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted-foreground">
            Output when run with Python (checked by our CI)
          </summary>
          <pre className="overflow-x-auto bg-muted/40 px-4 py-3 font-mono text-xs">
            {example.expectedOutput.trimEnd()}
          </pre>
        </details>
      ) : null}
    </figure>
  );
}

export function CodeExamples({
  examples,
  lang,
  preferred,
}: {
  examples: CodeExample[];
  lang: ExplanationLanguage;
  preferred: ProgrammingLanguage;
}) {
  return (
    <div className="space-y-4">
      {examples.map((example) => (
        <ExampleBlock key={example.id} example={example} lang={lang} preferred={preferred} />
      ))}
    </div>
  );
}
