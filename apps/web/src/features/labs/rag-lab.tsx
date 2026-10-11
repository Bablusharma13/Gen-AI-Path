'use client';

import { RAG_LAB_CORPUS, ragLabConfigSchema, runRagPipeline } from '@genpath/ai-core/labs';
import type { LabStep } from '@genpath/shared';
import { useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { BarList } from '@/components/viz/bar-list';
import { StepPlayer } from './step-player';

const QUESTIONS = [
  'Can I get a refund after three weeks?',
  'When are mentor office hours?',
  'Do I need a GPU laptop?',
  'How many one-to-one sessions do I get?',
  'What is the capital of Peru?',
];

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm">
        {label}: <span className="font-medium tabular-nums">{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </div>
  );
}

export function RagLab({ config }: { config: Record<string, unknown> }) {
  const [base] = useState(() => {
    const parsed = ragLabConfigSchema.safeParse(config);
    return parsed.success ? parsed.data : ragLabConfigSchema.parse({});
  });
  const [question, setQuestion] = useState(base.question);
  const [chunkSize, setChunkSize] = useState(base.chunkSize);
  const [overlap, setOverlap] = useState(base.overlap);
  const [topK, setTopK] = useState(base.topK);
  const [keywordWeight, setKeywordWeight] = useState(base.keywordWeight);
  const presetId = useId();
  const questionId = useId();

  const safeOverlap = Math.min(overlap, chunkSize - 1);
  const result = useMemo(
    () =>
      runRagPipeline({
        question: question.trim().length >= 3 ? question : QUESTIONS[0],
        chunkSize,
        overlap: safeOverlap,
        topK,
        keywordWeight,
        tokenBudget: base.tokenBudget,
      }),
    [question, chunkSize, safeOverlap, topK, keywordWeight, base.tokenBudget],
  );

  const render = (step: LabStep) => {
    switch (step.id) {
      case 'ingest':
        return (
          <ul className="grid gap-2 sm:grid-cols-3">
            {RAG_LAB_CORPUS.map((d) => (
              <li key={d.id} className="rounded-lg border bg-card p-3 text-sm">
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">{d.text.split(/\s+/).length} words</p>
              </li>
            ))}
          </ul>
        );
      case 'chunk':
        return (
          <ol className="grid max-h-80 gap-2 overflow-auto pr-1 sm:grid-cols-2">
            {result.chunks.map((c) => (
              <li key={c.id} className="rounded-lg border bg-card p-3 text-xs">
                <p className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{c.id}</Badge>
                  <span className="text-muted-foreground">
                    {c.wordCount} words · {c.headingPath.slice(1).join(' › ')}
                  </span>
                </p>
                <p className="text-sm">{c.text}</p>
              </li>
            ))}
          </ol>
        );
      case 'embed':
        return (
          <p className="text-sm text-muted-foreground">
            {result.chunks.length} chunks → {result.chunks.length} vectors of 256 numbers each. The
            question gets one too, computed the same way — comparing vectors from different methods
            would be meaningless.
          </p>
        );
      case 'retrieve':
        return (
          <BarList
            label="Chunk scores for the question"
            max={1}
            items={result.ranking.slice(0, 12).map((r) => ({
              id: r.id,
              label: r.id,
              value: Math.max(0, r.score),
              emphasized: r.retrieved,
              note: result.chunks.find((c) => c.id === r.id)?.text,
            }))}
          />
        );
      case 'context':
        return (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-mono text-xs">
            {result.context || '(empty — nothing fit the budget)'}
          </pre>
        );
      default:
        return result.answer.found ? (
          <div className="space-y-3">
            <blockquote className="rounded-lg border-l-4 border-primary bg-primary/5 p-4 text-sm">
              {result.answer.sentences.map((s, i) => (
                <span key={i}>
                  {s.text} <sup className="font-semibold">[{s.citation}]</sup>{' '}
                </span>
              ))}
            </blockquote>
            <ul className="text-xs text-muted-foreground">
              {result.retrieved.map((r, i) => (
                <li key={r.chunk.id}>
                  [{i + 1}] {r.chunk.documentTitle} — {r.chunk.id}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Alert tone="warning" title="I couldn't find this in the documents">
            A grounded system refuses rather than inventing an answer when retrieval finds nothing
            relevant.
          </Alert>
        );
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={presetId} className="text-sm font-medium">
            Sample question
          </label>
          <NativeSelect
            id={presetId}
            value={QUESTIONS.includes(question) ? question : ''}
            onChange={(e) => e.target.value && setQuestion(e.target.value)}
          >
            <option value="">Custom…</option>
            {QUESTIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={questionId} className="text-sm font-medium">
            Question
          </label>
          <Input
            id={questionId}
            value={question}
            maxLength={300}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <Slider
          label="Chunk size (words)"
          value={chunkSize}
          min={10}
          max={150}
          step={5}
          onChange={setChunkSize}
        />
        <Slider
          label="Overlap (words)"
          value={safeOverlap}
          min={0}
          max={Math.min(60, chunkSize - 1)}
          onChange={setOverlap}
        />
        <Slider label="Top-K chunks" value={topK} min={1} max={6} onChange={setTopK} />
        <Slider
          label="Keyword weight (hybrid search)"
          value={keywordWeight}
          min={0}
          max={1}
          step={0.1}
          onChange={setKeywordWeight}
          format={(v) => v.toFixed(1)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Corpus: a fictional “Kirana Code School” student handbook written for this lab.{' '}
        {result.chunks.length} chunks with the current settings.
      </p>
      <StepPlayer
        key={`${chunkSize}-${safeOverlap}-${topK}-${keywordWeight}-${question}`}
        steps={result.steps}
        render={render}
        label="RAG pipeline walkthrough"
      />
    </div>
  );
}
