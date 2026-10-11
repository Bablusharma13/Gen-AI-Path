'use client';

import { parseSse } from '@genpath/ai-core';
import type {
  AiStatusDto,
  ChatMessageDto,
  ChatRequest,
  ChatSessionDto,
  ChatStreamEvent,
  ExplanationDto,
  HintDto,
} from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, rawRequest, toApiError } from './api';

export const mentorKeys = {
  status: ['ai-status'] as const,
  sessions: ['ai-sessions'] as const,
  session: (id: string) => ['ai-session', id] as const,
};

export const useAiStatus = () =>
  useQuery({
    queryKey: mentorKeys.status,
    queryFn: () => api<AiStatusDto>('/ai/status'),
    staleTime: 30_000,
  });

export const useChatSessions = () =>
  useQuery({
    queryKey: mentorKeys.sessions,
    queryFn: () => api<ChatSessionDto[]>('/ai/sessions?limit=50'),
  });

export const useChatSession = (id: string | null) =>
  useQuery({
    queryKey: mentorKeys.session(id ?? ''),
    queryFn: () =>
      api<{ session: ChatSessionDto; messages: ChatMessageDto[] }>(`/ai/sessions/${id}`),
    enabled: Boolean(id),
  });

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/ai/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mentorKeys.sessions }),
  });
}

export function useDeleteAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ sessions: number; messages: number }>('/ai/sessions', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mentorKeys.sessions }),
  });
}

export function useFeedback() {
  return useMutation({
    mutationFn: ({ messageId, rating }: { messageId: string; rating: 'up' | 'down' | null }) =>
      api<void>(`/ai/messages/${messageId}/feedback`, { method: 'POST', body: { rating } }),
  });
}

export function useHint() {
  return useMutation({
    mutationFn: (input: {
      exerciseId: string;
      code: string;
      failures: string[];
      hintsSoFar: number;
    }) => api<HintDto>('/ai/hint', { method: 'POST', body: input }),
  });
}

export function useExplain() {
  return useMutation({
    mutationFn: (input: { concept: string; lessonId?: string }) =>
      api<ExplanationDto>('/ai/explain', { method: 'POST', body: input }),
  });
}

/**
 * Streams a mentor answer. Errors before the stream opens (validation, quota, not configured)
 * are thrown as ApiError; errors during the stream arrive as `error` events.
 */
export async function streamChat(
  body: ChatRequest,
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const res = await rawRequest('/ai/chat/stream', { method: 'POST', body, signal });
  if (!res.ok || !res.body) throw await toApiError(res);
  for await (const message of parseSse(res.body)) {
    if (!message.event || !message.data) continue;
    try {
      onEvent({ type: message.event, data: JSON.parse(message.data) } as ChatStreamEvent);
    } catch {
      // Ignore malformed frames rather than breaking the whole answer.
    }
  }
}
