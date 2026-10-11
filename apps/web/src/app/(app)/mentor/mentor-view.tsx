'use client';

import {
  LEARNING_STYLE_LABELS,
  LEARNING_STYLES,
  type ChatMessageDto,
  type LearningStyle,
  type LessonDto,
} from '@genpath/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, MessageSquarePlus, Send, Square, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useMe, useProfile } from '@/lib/auth';
import { tx } from '@/lib/localize';
import {
  mentorKeys,
  streamChat,
  useAiStatus,
  useChatSession,
  useChatSessions,
  useDeleteSession,
} from '@/lib/mentor';
import { useLearnerLanguages } from '@/lib/use-learner';
import { cn, formatRelative } from '@/lib/utils';
import { ChatMessage, type UiMessage } from './chat-message';
import { ConceptCardDialog } from './concept-card';
import { SetupGuide } from './setup-guide';

const MAX_CHARS = 8000;
const SUGGESTIONS = [
  'Embeddings ko ek simple analogy se samjhao',
  'Quiz me with 3 questions on Python lists',
  'How does RAG reduce hallucinations?',
  'Review my approach: retry an API call on every error',
];

const toUi = (m: ChatMessageDto): UiMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
  status: m.status,
  isMock: m.isMock,
  feedback: m.feedback,
});

export function MentorView() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const me = useMe();
  const profile = useProfile();
  const status = useAiStatus();
  const sessions = useChatSessions();
  const deleteSession = useDeleteSession();
  const { lang } = useLearnerLanguages();
  const lessonId = params.get('lessonId') ?? undefined;
  const lesson = useQuery({
    queryKey: ['lesson-by-id', lessonId],
    queryFn: () => api<LessonDto>(`/lessons/${lessonId}`),
    enabled: Boolean(lessonId),
  });

  const [sessionId, setSessionId] = useState<string | null>(params.get('session'));
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [mode, setMode] = useState<LearningStyle | null>(null);
  // `?prompt=` pre-fills the box (e.g. from the Career Center); the learner still decides to send it.
  const [input, setInput] = useState(() => (params.get('prompt') ?? '').slice(0, 2000));
  const [streaming, setStreaming] = useState(false);
  const [lessonContext, setLessonContext] = useState(Boolean(lessonId));
  const abortRef = useRef<AbortController | null>(null);
  // Id of the assistant message being streamed (local placeholder until the server assigns one).
  const assistantIdRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const modeId = useId();
  const inputId = useId();
  const session = useChatSession(sessionId);

  // Load a conversation's history once when it is opened (React's "adjust state on change" pattern).
  if (sessionId && session.data && loadedId !== sessionId && !streaming) {
    setLoadedId(sessionId);
    setMessages(session.data.messages.map(toUi));
    setMode(session.data.session.mode as LearningStyle);
  }

  const effectiveMode: LearningStyle =
    mode ?? profile.data?.preferences.learningStyle ?? 'beginner_friendly';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (id: string, patch: Partial<UiMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const openSession = (id: string | null) => {
    if (streaming) return;
    setSessionId(id);
    setLoadedId(null);
    setMessages([]);
    setMode(null);
    window.history.replaceState(null, '', id ? `/mentor?session=${id}` : '/mentor');
  };

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const localId = crypto.randomUUID();
    const userLocal: UiMessage = {
      id: `local-u-${localId}`,
      role: 'user',
      content: message,
      status: 'complete',
      isMock: false,
      feedback: null,
    };
    const localAssistant = `local-a-${localId}`;
    assistantIdRef.current = localAssistant;
    setMessages((prev) => [
      ...prev,
      userLocal,
      {
        id: localAssistant,
        role: 'assistant',
        content: '',
        status: 'streaming',
        isMock: false,
        feedback: null,
      },
    ]);
    setInput('');
    setStreaming(true);

    try {
      await streamChat(
        {
          ...(sessionId ? { sessionId } : {}),
          message,
          mode: effectiveMode,
          ...(!sessionId && lessonId && lessonContext ? { lessonId } : {}),
        },
        controller.signal,
        (event) => {
          if (event.type === 'meta') {
            assistantIdRef.current = event.data.messageId;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === userLocal.id
                  ? { ...m, id: event.data.userMessageId }
                  : m.id === localAssistant
                    ? { ...m, id: event.data.messageId, isMock: event.data.isMock }
                    : m,
              ),
            );
            if (!sessionId) {
              setSessionId(event.data.sessionId);
              setLoadedId(event.data.sessionId);
              window.history.replaceState(null, '', `/mentor?session=${event.data.sessionId}`);
            }
          } else if (event.type === 'delta') {
            const id = assistantIdRef.current;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: m.content + event.data.text } : m)),
            );
          } else if (event.type === 'done') {
            update(assistantIdRef.current, {
              content: event.data.content,
              status: event.data.status,
            });
          } else if (event.type === 'error') {
            update(assistantIdRef.current, { status: 'error', errorMessage: event.data.message });
          }
        },
      );
    } catch (err) {
      if (controller.signal.aborted) {
        update(assistantIdRef.current, { status: 'stopped' });
      } else {
        // Nothing was saved (validation, quota, not configured): roll back and keep the text.
        const failedId = assistantIdRef.current;
        setMessages((prev) => prev.filter((m) => m.id !== userLocal.id && m.id !== failedId));
        setInput(message);
        if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') void status.refetch();
        toast.error(errorMessage(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      void qc.invalidateQueries({ queryKey: mentorKeys.sessions });
      void qc.invalidateQueries({ queryKey: mentorKeys.status });
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  if (status.isPending) return <Skeleton className="h-[70vh]" />;
  if (status.isError)
    return (
      <ErrorState message="Could not reach the AI service" onRetry={() => void status.refetch()} />
    );
  if (!status.data.configured) {
    const role = me.data?.role;
    return <SetupGuide isAdmin={role === 'platform_admin' || role === 'org_admin'} />;
  }

  const limits = status.data.limits;
  const quotaGone = limits.remaining <= 0;

  return (
    <div className="grid h-[calc(100dvh-8rem)] gap-4 lg:grid-cols-[16rem_1fr]">
      <aside
        className="hidden min-h-0 flex-col rounded-xl border bg-card lg:flex"
        aria-label="Conversations"
      >
        <div className="space-y-2 border-b p-3">
          <Button className="w-full" onClick={() => openSession(null)} disabled={streaming}>
            <MessageSquarePlus aria-hidden /> New conversation
          </Button>
          <ConceptCardDialog lessonId={lessonContext ? lessonId : undefined} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {sessions.isPending ? (
            <Skeleton className="h-24" />
          ) : sessions.data && sessions.data.length > 0 ? (
            <ul className="space-y-0.5">
              {sessions.data.map((s) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openSession(s.id)}
                    aria-current={s.id === sessionId ? 'true' : undefined}
                    className={cn(
                      'min-w-0 flex-1 cursor-pointer rounded-md px-2 py-1.5 text-left text-sm',
                      s.id === sessionId ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                    )}
                  >
                    <span className="block truncate">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatRelative(s.lastMessageAt)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete conversation ${s.title}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() =>
                      deleteSession.mutate(s.id, {
                        onSuccess: () => {
                          if (s.id === sessionId) openSession(null);
                          toast.success('Conversation deleted');
                        },
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-2 text-sm text-muted-foreground">No conversations yet.</p>
          )}
        </div>
        <p className="border-t p-3 text-xs text-muted-foreground">
          {limits.remaining} of {limits.daily} AI requests left today
        </p>
      </aside>

      <section className="flex min-h-0 flex-col rounded-xl border bg-card" aria-label="Chat">
        <header className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="flex items-center gap-2">
            <label htmlFor={modeId} className="text-sm text-muted-foreground">
              Mode
            </label>
            <NativeSelect
              id={modeId}
              className="h-8 w-auto text-sm"
              value={effectiveMode}
              onChange={(e) => setMode(e.target.value as LearningStyle)}
            >
              {LEARNING_STYLES.map((s) => (
                <option key={s} value={s}>
                  {LEARNING_STYLE_LABELS[s].title}
                </option>
              ))}
            </NativeSelect>
          </div>
          {lessonId && lessonContext && !sessionId ? (
            <Badge variant="secondary" className="gap-1.5 py-1">
              <BookOpen aria-hidden />
              {lesson.data ? tx(lesson.data.title, lang) : 'Current lesson'}
              <button
                type="button"
                aria-label="Remove lesson context"
                onClick={() => setLessonContext(false)}
                className="cursor-pointer"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ) : null}
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {status.data.isMock ? <Badge variant="warning">Mock AI</Badge> : null}
            {status.data.model}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => openSession(null)}
            disabled={streaming}
          >
            <MessageSquarePlus aria-hidden /> New
          </Button>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"
          aria-live="polite"
          aria-busy={streaming}
        >
          {sessionId && session.isPending && loadedId !== sessionId ? (
            <Skeleton className="h-32" />
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
              <p className="text-lg font-semibold">Ask anything about AI engineering</p>
              <p className="text-sm text-muted-foreground">
                Answers follow your explanation language and code language. On exercises the mentor
                gives hints first.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={quotaGone}
                    onClick={() => void send(s)}
                    className="cursor-pointer rounded-lg border p-3 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                streaming={streaming && m.status === 'streaming'}
              />
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-2 border-t p-3">
          {quotaGone ? (
            <Alert tone="warning">
              You have used today’s AI requests. They reset at 00:00 UTC.
            </Alert>
          ) : null}
          <label htmlFor={inputId} className="sr-only">
            Message the AI Mentor
          </label>
          <div className="flex items-end gap-2">
            <Textarea
              id={inputId}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_CHARS}
              rows={2}
              placeholder="Ask a question, paste an error, or describe what you are stuck on…"
              className="max-h-48 min-h-12 resize-y"
              disabled={quotaGone}
            />
            {streaming ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop generating"
              >
                <Square aria-hidden /> Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim() || quotaGone} aria-label="Send message">
                <Send aria-hidden /> Send
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Enter to send · Shift+Enter for a new line · The mentor can be wrong — verify code by
            running it.
          </p>
        </form>
      </section>
    </div>
  );
}
