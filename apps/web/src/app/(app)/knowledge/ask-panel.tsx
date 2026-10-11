'use client';

import type { KnowledgeAnswerDto } from '@genpath/shared';
import { BookOpenCheck, FileText, Info, Search, SearchX } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Label, Textarea } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { useAskKnowledge } from '@/lib/knowledge';

const REASON_TEXT: Record<
  Exclude<KnowledgeAnswerDto['reason'], 'answered'>,
  { title: string; body: string }
> = {
  not_found: {
    title: 'Not found in your organization’s documents',
    body: 'No passage was relevant enough, so the AI was not asked to guess. Try different words, or ask an admin to upload the right document.',
  },
  model_not_found: {
    title: 'The documents do not answer this',
    body: 'Related passages were found (listed below if any), but the AI reported that they do not contain the answer.',
  },
  uncited: {
    title: 'Answer withheld',
    body: 'The AI’s reply did not cite any of the retrieved passages, so it was not shown. Rephrase the question or read the passages directly.',
  },
  ai_not_configured: {
    title: 'AI is not configured — showing the most relevant passages',
    body: 'An administrator can set AI_PROVIDER to get written answers. Retrieval works without it.',
  },
  refused: {
    title: 'The AI declined to answer',
    body: 'Try rephrasing the question.',
  },
};

function Answer({ data }: { data: KnowledgeAnswerDto }) {
  const notice = data.reason === 'answered' ? null : REASON_TEXT[data.reason];
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Answer</CardTitle>
          {data.isMock ? <Badge variant="warning">Mock AI — no model was called</Badge> : null}
          {data.model && !data.isMock ? <Badge variant="outline">{data.model}</Badge> : null}
          {data.truncated ? <Badge variant="warning">Cut off at the length limit</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice ? (
          <Alert
            tone={data.reason === 'ai_not_configured' ? 'info' : 'warning'}
            title={notice.title}
          >
            {notice.body}
          </Alert>
        ) : null}
        {data.answer ? <Markdown>{data.answer}</Markdown> : null}
        {data.droppedCitations.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Removed {data.droppedCitations.length} citation
            {data.droppedCitations.length === 1 ? '' : 's'} that did not match a retrieved passage (
            {data.droppedCitations.map((n) => `[${n}]`).join(', ')}).
          </p>
        ) : null}
        {data.citations.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{data.answer ? 'Sources' : 'Relevant passages'}</h3>
            <ol className="space-y-2">
              {data.citations.map((c) => (
                <li key={c.chunkId} className="rounded-lg border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="rounded bg-primary/10 px-1.5 text-xs text-primary">
                      [{c.n}]
                    </span>
                    <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                    {c.documentTitle}
                    {c.headingPath.length ? (
                      <span className="font-normal text-muted-foreground">
                        › {c.headingPath.join(' › ')}
                      </span>
                    ) : null}
                  </p>
                  {/* Document text is shown as plain text, never as HTML or Markdown. */}
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.excerpt}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {data.retrieval.semantic
            ? `Semantic retrieval with ${data.retrieval.embeddingModel}`
            : 'Lexical retrieval (local-hash: matches shared words, not meaning). Configure an embedding model for semantic search.'}
          {` · ${data.retrieval.vectorStore} · ${data.retrieval.candidates} candidates · best score ${data.retrieval.topScore ?? '—'} (threshold ${data.retrieval.minScore})`}
        </p>
      </CardContent>
    </Card>
  );
}

export function AskPanel({ orgId, documentCount }: { orgId: string; documentCount: number }) {
  const ask = useAskKnowledge(orgId);
  const [question, setQuestion] = useState('');
  const id = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3 || ask.isPending) return;
    ask.mutate({ question: q, topK: 5 });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-2">
        <Label htmlFor={id}>Ask a question about your organization’s documents</Label>
        <Textarea
          id={id}
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          placeholder="e.g. How many days do customers have to request a refund?"
          className="min-h-20"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={ask.isPending || question.trim().length < 3 || documentCount === 0}
          >
            {ask.isPending ? <Spinner label="Searching" /> : <Search aria-hidden />} Ask
          </Button>
          <p className="text-xs text-muted-foreground">
            Answers use only your organization’s documents and cite them. If they do not cover the
            question, you will be told.
          </p>
        </div>
      </form>
      {documentCount === 0 ? (
        <Alert tone="info" title="No documents yet">
          An organization admin needs to upload documents before questions can be answered.
        </Alert>
      ) : null}
      {ask.isError ? (
        <Alert tone="error" title="Could not answer">
          {ask.error instanceof ApiError && ask.error.code === 'QUOTA_EXCEEDED'
            ? ask.error.message
            : errorMessage(ask.error)}
        </Alert>
      ) : null}
      {ask.data ? <Answer data={ask.data} /> : null}
      {!ask.data && !ask.isPending && documentCount > 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {ask.isError ? (
            <SearchX className="size-4" aria-hidden />
          ) : (
            <BookOpenCheck className="size-4" aria-hidden />
          )}
          Every answer lists the passages it used, so you can check it.
        </div>
      ) : null}
    </div>
  );
}
