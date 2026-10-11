import { z } from 'zod';
import { contentIdSchema, objectIdSchema } from './common';
import { learningStyleSchema } from './enums';

export const MAX_CHAT_MESSAGE_CHARS = 8000;

export const chatRequestSchema = z.object({
  sessionId: objectIdSchema.optional(),
  message: z.string().trim().min(1, 'Type a message').max(MAX_CHAT_MESSAGE_CHARS),
  mode: learningStyleSchema.optional(),
  lessonId: contentIdSchema.optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const hintRequestSchema = z.object({
  exerciseId: contentIdSchema,
  code: z.string().max(20_000),
  failures: z.array(z.string().max(500)).max(20).default([]),
  hintsSoFar: z.number().int().min(0).max(10).default(0),
});

export const explainRequestSchema = z.object({
  concept: z.string().trim().min(2).max(300),
  lessonId: contentIdSchema.optional(),
});

export const feedbackSchema = z.object({ rating: z.enum(['up', 'down']).nullable() });

export const labEmbeddingsSchema = z.object({
  texts: z.array(z.string().trim().min(1).max(300)).min(2).max(8),
});

export type ChatMessageStatus =
  'streaming' | 'complete' | 'truncated' | 'stopped' | 'refused' | 'error';

export interface ChatMessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatMessageStatus;
  errorCode: string | null;
  isMock: boolean;
  model: string | null;
  feedback: 'up' | 'down' | null;
  createdAt: string;
}

export interface ChatSessionDto {
  id: string;
  title: string;
  mode: string;
  lessonId: string | null;
  messageCount: number;
  lastMessageAt: string;
}

/** Events sent over the chat SSE stream. */
export type ChatStreamEvent =
  | {
      type: 'meta';
      data: {
        sessionId: string;
        userMessageId: string;
        messageId: string;
        isMock: boolean;
        model: string;
      };
    }
  | { type: 'delta'; data: { text: string } }
  | {
      type: 'done';
      data: {
        messageId: string;
        status: ChatMessageStatus;
        content: string;
        usage: { inputTokens: number; outputTokens: number };
      };
    }
  | { type: 'error'; data: { code: string; message: string; messageId: string | null } };

export interface AiStatusDto {
  configured: boolean;
  provider: string;
  model: string | null;
  isMock: boolean;
  embeddings: { provider: string; model: string; semantic: boolean };
  limits: { daily: number; usedToday: number; remaining: number };
}

export interface HintDto {
  hint: string;
  nextStep: string;
  concept: string;
  source: 'ai' | 'curriculum';
  isMock: boolean;
}

export interface ExplanationDto {
  title: string;
  summary: string;
  analogy: string;
  example: { language: string; code: string } | null;
  checkQuestion: string;
  commonMistake: string;
  isMock: boolean;
}
