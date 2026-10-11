import { LEARNING_STYLES } from '@genpath/shared';
import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

export const MESSAGE_STATUSES = [
  'streaming',
  'complete',
  'truncated',
  'stopped',
  'refused',
  'error',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

const chatSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    mode: { type: String, enum: LEARNING_STYLES, required: true },
    lessonId: { type: String, default: null },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'chatSessions' },
);
chatSessionSchema.index({ userId: 1, lastMessageAt: -1 });

/** One message per document: conversations never grow an unbounded array. */
const chatMessageSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '', maxlength: 20_000 },
    status: { type: String, enum: MESSAGE_STATUSES, required: true },
    errorCode: { type: String, default: null },
    provider: { type: String, default: null },
    model: { type: String, default: null },
    isMock: { type: Boolean, default: false },
    fallbackUsed: { type: Boolean, default: false },
    promptId: { type: String, default: null },
    promptVersion: { type: Number, default: null },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    feedback: { type: String, enum: ['up', 'down', null], default: null },
  },
  { timestamps: true, collection: 'chatMessages' },
);
chatMessageSchema.index({ sessionId: 1, createdAt: 1 });
chatMessageSchema.index({ userId: 1, createdAt: -1 });

export const AI_FEATURES = ['chat', 'hint', 'explain', 'rag', 'lab-embeddings'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Metadata for every provider call — no prompt or answer text. Drives quotas, usage and cost. */
const aiInteractionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    feature: { type: String, enum: AI_FEATURES, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    promptId: { type: String, default: null },
    promptVersion: { type: Number, default: null },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    usageEstimated: { type: Boolean, default: false },
    costUsd: { type: Number, default: null },
    latencyMs: { type: Number, required: true },
    status: {
      type: String,
      enum: ['ok', 'truncated', 'refused', 'stopped', 'error'],
      required: true,
    },
    errorCode: { type: String, default: null },
    isMock: { type: Boolean, default: false },
    fallbackUsed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'aiInteractions' },
);
aiInteractionSchema.index({ userId: 1, createdAt: -1 });
aiInteractionSchema.index({ feature: 1, createdAt: -1 });
aiInteractionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 86_400 });

export type ChatSession = InferSchemaType<typeof chatSessionSchema> & { _id: Types.ObjectId };
export type ChatMessage = InferSchemaType<typeof chatMessageSchema> & { _id: Types.ObjectId };

export const ChatSessionModel = model('ChatSession', chatSessionSchema);
export const ChatMessageModel = model('ChatMessage', chatMessageSchema);
export const AiInteractionModel = model('AiInteraction', aiInteractionSchema);
