'use client';

import type { Tiktoken } from 'js-tiktoken/lite';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState, Progress, Skeleton } from '@/components/ui/feedback';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ENCODINGS, loadEncoding, tokenizePieces, type EncodingName } from './tokenizer';

const SAMPLES: { label: string; text: string }[] = [
  { label: 'English', text: 'Embeddings turn text into vectors so we can search by meaning.' },
  {
    label: 'Hinglish',
    text: 'Embeddings text ko vectors mein badalte hain taaki meaning se search kar sakein.',
  },
  { label: 'Hindi', text: 'एम्बेडिंग्स टेक्स्ट को वेक्टर में बदलते हैं ताकि हम अर्थ से खोज सकें।' },
  { label: 'Python', text: 'def cosine(a, b):\n    return dot(a, b) / (norm(a) * norm(b))' },
  { label: 'JSON', text: '{"answer": "Use RAG", "confidence": 0.82, "sources": [1, 3]}' },
];

/** Illustrative context sizes — check your model's documentation for its real limit. */
const CONTEXT_WINDOWS = [8_192, 32_768, 128_000, 200_000, 1_000_000];

function visible(text: string): string {
  return text.replace(/ /g, '·').replace(/\n/g, '↵\n').replace(/\t/g, '→');
}

function useEncoder(name: EncodingName) {
  const [state, setState] = useState<{
    name: EncodingName;
    encoder: Tiktoken | null;
    error: string | null;
  }>({
    name,
    encoder: null,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    loadEncoding(name).then(
      (encoder) => !cancelled && setState({ name, encoder, error: null }),
      (err: unknown) =>
        !cancelled &&
        setState({
          name,
          encoder: null,
          error: err instanceof Error ? err.message : 'Failed to load',
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [name]);
  return state.name === name ? state : { name, encoder: null, error: null };
}

export function TokensLab({ config }: { config: Record<string, unknown> }) {
  const initialText =
    typeof config.text === 'string' ? config.text.slice(0, 4000) : SAMPLES[0]!.text;
  const [text, setText] = useState(initialText);
  const [encoding, setEncoding] = useState<EncodingName>('o200k_base');
  const [showIds, setShowIds] = useState(false);
  const [contextWindow, setContextWindow] = useState(128_000);
  const [reserve, setReserve] = useState(1_000);
  const ids = { text: useId(), enc: useId(), ctx: useId(), reserve: useId(), showIds: useId() };

  const primary = useEncoder(encoding);
  const other = useEncoder(encoding === 'o200k_base' ? 'cl100k_base' : 'o200k_base');

  const result = useMemo(
    () => (primary.encoder ? tokenizePieces(primary.encoder, text) : null),
    [primary.encoder, text],
  );
  const otherCount = useMemo(
    () => (other.encoder ? other.encoder.encode(text).length : null),
    [other.encoder, text],
  );

  const tokens = result?.ids.length ?? 0;
  const used = tokens + reserve;
  const percent = (used / contextWindow) * 100;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <Button key={s.label} variant="outline" size="sm" onClick={() => setText(s.text)}>
            {s.label}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={ids.text} className="text-sm font-medium">
          Text to tokenize
        </label>
        <Textarea
          id={ids.text}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          className="min-h-28 font-mono text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={ids.enc} className="text-sm font-medium">
            Encoding
          </label>
          <NativeSelect
            id={ids.enc}
            value={encoding}
            onChange={(e) => setEncoding(e.target.value as EncodingName)}
          >
            {Object.entries(ENCODINGS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end justify-between gap-3 rounded-lg border p-3">
          <label htmlFor={ids.showIds} className="text-sm">
            Show token IDs
          </label>
          <Switch id={ids.showIds} checked={showIds} onCheckedChange={setShowIds} />
        </div>
      </div>

      {primary.error ? (
        <ErrorState title="Tokenizer failed to load" message={primary.error} />
      ) : !result ? (
        <Skeleton className="h-32" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Tokens', tokens.toLocaleString()],
              ['Characters', text.length.toLocaleString()],
              ['Characters per token', tokens ? (text.length / tokens).toFixed(2) : '—'],
              ['Words', words.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <div
            aria-label="Tokens"
            className="flex flex-wrap gap-0.5 rounded-lg border bg-card p-3 font-mono text-sm leading-7"
          >
            {result.pieces.length === 0 ? (
              <span className="text-muted-foreground">Type something to see its tokens.</span>
            ) : (
              result.pieces.map((p, i) => (
                <span
                  key={i}
                  title={`Token ID${p.ids.length > 1 ? 's' : ''}: ${p.ids.join(', ')}${p.merged ? ' (several byte-level tokens form this text)' : ''}`}
                  className={cn(
                    'inline-flex flex-col items-center whitespace-pre rounded px-1',
                    i % 2 === 0 ? 'bg-primary/12' : 'bg-chart-2/15',
                    p.merged && 'ring-1 ring-inset ring-warning',
                  )}
                >
                  <span>{visible(p.text)}</span>
                  {showIds ? (
                    <span className="text-[10px] leading-3 text-muted-foreground">
                      {p.ids.join(' ')}
                    </span>
                  ) : null}
                </span>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            · = space, ↵ = newline. Outlined pieces needed several tokens (common for Hindi and
            emoji, because byte-level BPE splits one character into multiple bytes).
          </p>

          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">Same text, other encoding</p>
            <p className="text-muted-foreground">
              {otherCount === null
                ? 'Loading…'
                : `${ENCODINGS[encoding === 'o200k_base' ? 'cl100k_base' : 'o200k_base']}: ${otherCount.toLocaleString()} tokens (${otherCount === tokens ? 'same' : otherCount > tokens ? `+${otherCount - tokens}` : `${otherCount - tokens}`}).`}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <p className="font-medium">Context window budget</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={ids.ctx} className="text-sm">
                  Context window (example sizes)
                </label>
                <NativeSelect
                  id={ids.ctx}
                  value={contextWindow}
                  onChange={(e) => setContextWindow(Number(e.target.value))}
                >
                  {CONTEXT_WINDOWS.map((c) => (
                    <option key={c} value={c}>
                      {c.toLocaleString()} tokens
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={ids.reserve} className="text-sm">
                  Reserved for the answer (max output tokens): {reserve.toLocaleString()}
                </label>
                <input
                  id={ids.reserve}
                  type="range"
                  min={0}
                  max={16_000}
                  step={250}
                  value={reserve}
                  onChange={(e) => setReserve(Number(e.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
              </div>
            </div>
            <Progress value={percent} label="Context window usage" />
            <p className="text-sm text-muted-foreground">
              {tokens.toLocaleString()} input + {reserve.toLocaleString()} reserved output ={' '}
              {used.toLocaleString()} of {contextWindow.toLocaleString()} tokens (
              {percent < 0.1 ? '<0.1' : percent.toFixed(1)}%).
              {percent > 100
                ? ' This request would not fit — trim history or retrieve less context.'
                : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
