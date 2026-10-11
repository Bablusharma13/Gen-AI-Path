'use client';

import type { ChatMessageStatus } from '@genpath/shared';
import { Bot, Check, Copy, ThumbsDown, ThumbsUp, User } from 'lucide-react';
import { useState } from 'react';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/lib/mentor';
import { cn } from '@/lib/utils';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatMessageStatus;
  isMock: boolean;
  feedback: 'up' | 'down' | null;
  errorMessage?: string;
}

const STATUS_NOTE: Partial<Record<ChatMessageStatus, string>> = {
  stopped: 'You stopped this answer.',
  truncated: 'This answer hit the length limit and is cut off. Ask the mentor to continue.',
  refused: 'The model declined this request.',
  error: 'This answer failed.',
};

export function ChatMessage({ message, streaming }: { message: UiMessage; streaming: boolean }) {
  const feedback = useFeedback();
  const [rating, setRating] = useState(message.feedback);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const persisted = !message.id.startsWith('local-');

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div className={cn('min-w-0 max-w-[85%] space-y-1.5', isUser && 'items-end text-right')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-left',
            isUser ? 'bg-primary text-primary-foreground' : 'border bg-card',
            message.status === 'error' && 'border-destructive/40',
          )}
        >
          <span className="sr-only">{isUser ? 'You said:' : 'Mentor said:'}</span>
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : message.content ? (
            <Markdown className="text-sm">{message.content}</Markdown>
          ) : streaming ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1" aria-hidden>
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
              Thinking…
            </p>
          ) : null}
        </div>
        {!isUser ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {message.isMock ? <Badge variant="warning">Mock AI — no model was called</Badge> : null}
            {STATUS_NOTE[message.status] ? (
              <span className="text-xs text-muted-foreground">
                {message.errorMessage ?? STATUS_NOTE[message.status]}
              </span>
            ) : null}
            {persisted && !streaming && message.status === 'complete' ? (
              <span className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy answer"
                  onClick={() => {
                    void navigator.clipboard.writeText(message.content).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                </Button>
                {(['up', 'down'] as const).map((r) => (
                  <Button
                    key={r}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={r === 'up' ? 'Helpful' : 'Not helpful'}
                    aria-pressed={rating === r}
                    className={rating === r ? 'text-primary' : undefined}
                    onClick={() => {
                      const next = rating === r ? null : r;
                      setRating(next);
                      feedback.mutate({ messageId: message.id, rating: next });
                    }}
                  >
                    {r === 'up' ? <ThumbsUp aria-hidden /> : <ThumbsDown aria-hidden />}
                  </Button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
