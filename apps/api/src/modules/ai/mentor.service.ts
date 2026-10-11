import {
  CAREER_GOAL_LABELS,
  type AiStatusDto,
  type CareerGoal,
  type ChatMessageDto,
  type ChatMessageStatus,
  type ChatRequest,
  type ChatSessionDto,
  type ChatStreamEvent,
  type ExplanationDto,
  type HintDto,
  type LearningStyle,
  type LocalizedList,
  type LocalizedText,
} from '@genpath/shared';
import {
  AiProviderError,
  buildExplainPrompt,
  buildHintPrompt,
  buildMentorSystemPrompt,
  estimateCostUsd,
  explanationSchema,
  hintLeaksSolution,
  hintSchema,
  MENTOR_CHAT,
  MENTOR_EXPLAIN,
  MENTOR_HINT,
  type ChatTurn,
  type LearnerContext,
  type PromptRef,
  type StopReason,
  type TokenUsage,
} from '@genpath/ai-core/llm';
import { Types } from 'mongoose';
import type { AppContext } from '../../context';
import {
  AiInteractionModel,
  ChatMessageModel,
  ChatSessionModel,
  type AiFeature,
} from '../../db/models/ai.model';
import { CourseModel, ExerciseModel, LessonModel, LIVE } from '../../db/models/curriculum.model';
import { ProfileModel } from '../../db/models/profile.model';
import { LessonProgressModel } from '../../db/models/progress.model';
import { AppError, notFound } from '../../lib/errors';
import { utcDay, type LearningService } from '../learning/learning.service';
import { topicLabel, type ProgressService } from '../progress/progress.service';

const HISTORY_CHAR_BUDGET = 24_000;
const MAX_ASSISTANT_CHARS = 20_000;
const REFUSAL_NOTICE =
  'The AI model declined to answer this request. Try rephrasing it, or ask about a related programming or AI topic.';

const oid = (id: string) => new Types.ObjectId(id);

/** Learner-facing messages for provider failures. Details stay in the logs. */
export function toAppError(err: AiProviderError): AppError {
  switch (err.code) {
    case 'TIMEOUT':
      return new AppError('AI_TIMEOUT', 'The AI took too long to answer. Please try again.');
    case 'INVALID_RESPONSE':
      return new AppError(
        'AI_INVALID_OUTPUT',
        'The AI returned an answer we could not validate. Please try again.',
      );
    case 'RATE_LIMITED':
      return new AppError(
        'AI_PROVIDER_ERROR',
        'The AI provider is busy right now. Please try again in a minute.',
      );
    case 'AUTH':
      return new AppError(
        'AI_PROVIDER_ERROR',
        'The AI provider rejected GenPath’s credentials. An administrator needs to check the AI settings.',
      );
    case 'MODEL_NOT_FOUND':
      return new AppError(
        'AI_PROVIDER_ERROR',
        'The configured AI model is not available. An administrator needs to check AI_MODEL.',
      );
    case 'BAD_REQUEST':
      return new AppError(
        'AI_PROVIDER_ERROR',
        'The AI provider rejected this request. Try a shorter or simpler message.',
      );
    case 'NOT_CONFIGURED':
      return new AppError(
        'AI_NOT_CONFIGURED',
        'AI features are not configured on this server yet.',
      );
    default:
      return new AppError(
        'AI_PROVIDER_ERROR',
        'The AI provider is unavailable right now. Please try again later.',
      );
  }
}

function asProviderError(err: unknown): AiProviderError {
  return err instanceof AiProviderError
    ? err
    : new AiProviderError('UNAVAILABLE', 'Unexpected AI failure', { cause: err });
}

function statusFor(stop: StopReason): ChatMessageStatus {
  if (stop === 'refusal' || stop === 'content_filter') return 'refused';
  if (stop === 'max_tokens') return 'truncated';
  return 'complete';
}

const interactionStatus = (s: ChatMessageStatus) =>
  s === 'complete'
    ? 'ok'
    : s === 'streaming'
      ? 'error'
      : (s as 'truncated' | 'refused' | 'stopped' | 'error');

export interface PreparedChat {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  system: string;
  messages: ChatTurn[];
  lessonTitle: string | null;
}

export class MentorService {
  constructor(
    private readonly ctx: AppContext,
    private readonly learning: LearningService,
    private readonly progress: ProgressService,
  ) {}

  private get llm() {
    const llm = this.ctx.llm;
    if (!llm)
      throw new AppError('AI_NOT_CONFIGURED', 'AI features are not configured on this server yet.');
    return llm;
  }

  // ── Quotas and usage ────────────────────────────────────────────────────────

  private async usedToday(userId: string): Promise<number> {
    return AiInteractionModel.countDocuments({
      userId: oid(userId),
      createdAt: { $gte: new Date(`${utcDay()}T00:00:00.000Z`) },
    });
  }

  async assertQuota(userId: string): Promise<void> {
    const limit = this.ctx.config.ai.dailyRequestLimit;
    if (limit === 0 || (await this.usedToday(userId)) >= limit) {
      throw new AppError(
        'QUOTA_EXCEEDED',
        `You have used today’s ${limit} AI requests. The limit resets at 00:00 UTC — lessons, labs and quizzes keep working.`,
      );
    }
  }

  async record(
    userId: string,
    feature: AiFeature,
    entry: {
      prompt?: PromptRef;
      model?: string;
      usage?: TokenUsage;
      latencyMs: number;
      status: 'ok' | 'truncated' | 'refused' | 'stopped' | 'error';
      errorCode?: string | null;
      fallbackUsed?: boolean;
      provider?: string;
      isMock?: boolean;
    },
  ): Promise<void> {
    const llm = this.ctx.llm;
    const model = entry.model ?? llm?.model ?? 'unknown';
    try {
      await AiInteractionModel.create({
        userId: oid(userId),
        feature,
        provider: entry.provider ?? llm?.providerId ?? 'none',
        model,
        promptId: entry.prompt?.id ?? null,
        promptVersion: entry.prompt?.version ?? null,
        inputTokens: entry.usage?.inputTokens ?? 0,
        outputTokens: entry.usage?.outputTokens ?? 0,
        usageEstimated: entry.usage?.estimated ?? false,
        costUsd: entry.usage
          ? estimateCostUsd(model, entry.usage, this.ctx.config.ai.pricing)
          : null,
        latencyMs: entry.latencyMs,
        status: entry.status,
        errorCode: entry.errorCode ?? null,
        isMock: entry.isMock ?? llm?.isMock ?? false,
        fallbackUsed: entry.fallbackUsed ?? false,
      });
    } catch (err) {
      this.ctx.logger.error({ err }, 'failed to record AI interaction');
    }
  }

  async status(userId: string): Promise<AiStatusDto> {
    const used = await this.usedToday(userId);
    const daily = this.ctx.config.ai.dailyRequestLimit;
    const llm = this.ctx.llm;
    return {
      configured: Boolean(llm),
      provider: this.ctx.config.ai.provider,
      model: llm?.model ?? null,
      isMock: llm?.isMock ?? false,
      embeddings: {
        provider: this.ctx.embeddings.id,
        model: this.ctx.embeddings.model,
        semantic: this.ctx.embeddings.semantic,
      },
      limits: { daily, usedToday: used, remaining: Math.max(0, daily - used) },
    };
  }

  async usage(userId: string) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [rows, usedToday] = await Promise.all([
      AiInteractionModel.aggregate<{
        _id: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
      }>([
        { $match: { userId: oid(userId), createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$feature',
            requests: { $sum: 1 },
            inputTokens: { $sum: '$inputTokens' },
            outputTokens: { $sum: '$outputTokens' },
          },
        },
      ]),
      this.usedToday(userId),
    ]);
    return {
      today: { used: usedToday, limit: this.ctx.config.ai.dailyRequestLimit },
      last30Days: rows.map((r) => ({
        feature: r._id,
        requests: r.requests,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
      })),
    };
  }

  // ── Learner context (built server-side; never trusted from the client) ──────

  async learnerContext(
    userId: string,
    lessonId?: string,
    mode?: LearningStyle,
  ): Promise<{ context: LearnerContext; lessonTitle: string | null }> {
    const profile = await ProfileModel.findOne({ userId: oid(userId) }).lean();
    const prefs = profile?.preferences;
    const personalization = prefs?.mentorPersonalization ?? true;
    const context: LearnerContext = {
      explanationLanguage: (prefs?.explanationLanguage ??
        'hinglish') as LearnerContext['explanationLanguage'],
      programmingLanguage: (prefs?.primaryProgrammingLanguage ??
        'python') as LearnerContext['programmingLanguage'],
      mode: mode ?? ((prefs?.learningStyle ?? 'beginner_friendly') as LearningStyle),
      personalization,
    };

    if (personalization) {
      const [completedLessons, weak] = await Promise.all([
        LessonProgressModel.countDocuments({ userId: oid(userId), status: 'completed' }),
        this.progress.weakTopics(userId),
      ]);
      const goal = profile?.careerGoal as CareerGoal | null | undefined;
      context.learner = {
        level: profile?.level ?? null,
        careerGoal: goal ? CAREER_GOAL_LABELS[goal].title : null,
        experience: profile?.experience ?? null,
        completedLessons,
        weakTopics: weak.map((w) => topicLabel(w.topic)),
      };
    }

    let lessonTitle: string | null = null;
    if (lessonId) {
      const lesson = await LessonModel.findOne(
        { _id: lessonId, ...LIVE },
        { title: 1, summary: 1, objectives: 1, topics: 1, courseId: 1 },
      ).lean();
      if (!lesson) throw notFound('Lesson');
      const course = await CourseModel.findById(lesson.courseId, { title: 1 }).lean();
      lessonTitle = (lesson.title as LocalizedText).en;
      context.lesson = {
        courseTitle: (course?.title as LocalizedText | undefined)?.en ?? '',
        title: lessonTitle,
        summary: (lesson.summary as LocalizedText).en,
        objectives: (lesson.objectives as LocalizedList).en,
        topics: lesson.topics,
      };
    }
    return { context, lessonTitle };
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  /** Validation, quota and persistence before streaming starts (errors here are plain JSON). */
  async prepareChat(userId: string, input: ChatRequest): Promise<PreparedChat> {
    if (!this.ctx.llm)
      throw new AppError('AI_NOT_CONFIGURED', 'AI features are not configured on this server yet.');
    if (input.message.length > this.ctx.config.ai.maxInputChars) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Messages can be at most ${this.ctx.config.ai.maxInputChars} characters.`,
      );
    }
    await this.assertQuota(userId);

    let session = input.sessionId
      ? await ChatSessionModel.findOne({ _id: oid(input.sessionId), userId: oid(userId) }).lean()
      : null;
    if (input.sessionId && !session) throw notFound('Conversation');

    const lessonId = input.lessonId ?? session?.lessonId ?? undefined;
    const mode = (input.mode ?? session?.mode) as LearningStyle | undefined;
    const { context, lessonTitle } = await this.learnerContext(userId, lessonId, mode);

    if (!session) {
      const firstLine = input.message.split('\n')[0]!.trim();
      session = (
        await ChatSessionModel.create({
          userId: oid(userId),
          title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine,
          mode: context.mode,
          lessonId: lessonId ?? null,
          lastMessageAt: new Date(),
        })
      ).toObject();
    } else if (input.mode && input.mode !== session.mode) {
      await ChatSessionModel.updateOne({ _id: session._id }, { $set: { mode: input.mode } });
    }

    const previous = await ChatMessageModel.find(
      { sessionId: session._id, status: { $in: ['complete', 'truncated', 'stopped'] } },
      { role: 1, content: 1 },
    )
      // _id breaks ties: a user message and its reply placeholder can share a millisecond.
      .sort({ createdAt: -1, _id: -1 })
      .limit(40)
      .lean();
    const history: ChatTurn[] = [];
    let chars = input.message.length;
    for (const m of previous) {
      if (chars + m.content.length > HISTORY_CHAR_BUDGET) break;
      chars += m.content.length;
      history.unshift({ role: m.role as ChatTurn['role'], content: m.content });
    }
    while (history[0]?.role === 'assistant') history.shift();

    const [userMessage, assistantMessage] = await ChatMessageModel.create([
      {
        sessionId: session._id,
        userId: oid(userId),
        role: 'user',
        content: input.message,
        status: 'complete',
      },
      {
        sessionId: session._id,
        userId: oid(userId),
        role: 'assistant',
        content: '',
        status: 'streaming',
        provider: this.ctx.llm?.providerId ?? null,
        model: this.ctx.llm?.model ?? null,
        isMock: this.ctx.llm?.isMock ?? false,
        promptId: MENTOR_CHAT.id,
        promptVersion: MENTOR_CHAT.version,
      },
    ]);
    await ChatSessionModel.updateOne(
      { _id: session._id },
      { $set: { lastMessageAt: new Date() }, $inc: { messageCount: 2 } },
    );

    return {
      sessionId: session._id.toString(),
      userMessageId: userMessage!._id.toString(),
      assistantMessageId: assistantMessage!._id.toString(),
      system: buildMentorSystemPrompt(context),
      messages: [...history, { role: 'user', content: input.message }],
      lessonTitle,
    };
  }

  /** Streams the answer, then persists it with an honest final status. */
  async *runChat(
    userId: string,
    chat: PreparedChat,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const llm = this.llm;
    const started = Date.now();
    yield {
      type: 'meta',
      data: {
        sessionId: chat.sessionId,
        userMessageId: chat.userMessageId,
        messageId: chat.assistantMessageId,
        isMock: llm.isMock,
        model: llm.model,
      },
    };

    let text = '';
    try {
      let done: {
        usage: TokenUsage;
        stopReason: StopReason;
        model: string;
        fallbackUsed: boolean;
      } | null = null;
      for await (const event of llm.stream({
        system: chat.system,
        messages: chat.messages,
        effort: 'medium',
        signal,
      })) {
        if (event.type === 'text') {
          if (text.length < MAX_ASSISTANT_CHARS) text += event.text;
          yield { type: 'delta', data: { text: event.text } };
        } else {
          done = event;
        }
      }
      const status = statusFor(done?.stopReason ?? 'other');
      // A refused answer is discarded, never shown as if it were complete.
      const content = status === 'refused' ? REFUSAL_NOTICE : text.slice(0, MAX_ASSISTANT_CHARS);
      await ChatMessageModel.updateOne(
        { _id: oid(chat.assistantMessageId) },
        {
          $set: {
            content,
            status,
            model: done?.model ?? llm.model,
            fallbackUsed: done?.fallbackUsed ?? false,
            inputTokens: done?.usage.inputTokens ?? null,
            outputTokens: done?.usage.outputTokens ?? null,
          },
        },
      );
      await this.record(userId, 'chat', {
        prompt: MENTOR_CHAT,
        ...(done ? { model: done.model, usage: done.usage, fallbackUsed: done.fallbackUsed } : {}),
        latencyMs: Date.now() - started,
        status: interactionStatus(status),
      });
      await this.learning.recordActivity(
        userId,
        {
          type: 'mentor_question',
          refId: chat.sessionId,
          title: chat.lessonTitle
            ? `Asked the mentor about ${chat.lessonTitle}`
            : 'Asked the AI mentor',
        },
        { countsForStreak: false },
      );
      yield {
        type: 'done',
        data: {
          messageId: chat.assistantMessageId,
          status,
          content,
          usage: {
            inputTokens: done?.usage.inputTokens ?? 0,
            outputTokens: done?.usage.outputTokens ?? 0,
          },
        },
      };
    } catch (err) {
      const error = asProviderError(err);
      const stopped = error.code === 'ABORTED' || signal.aborted;
      const status: ChatMessageStatus = stopped ? 'stopped' : 'error';
      await ChatMessageModel.updateOne(
        { _id: oid(chat.assistantMessageId) },
        {
          $set: {
            content: text.slice(0, MAX_ASSISTANT_CHARS),
            status,
            errorCode: stopped ? null : error.code,
          },
        },
      );
      await this.record(userId, 'chat', {
        prompt: MENTOR_CHAT,
        latencyMs: Date.now() - started,
        status,
        errorCode: stopped ? null : error.code,
      });
      if (!stopped) {
        this.ctx.logger.warn(
          { code: error.code, status: error.options.status, detail: error.options.detail },
          'mentor chat failed',
        );
        const appError = toAppError(error);
        yield {
          type: 'error',
          data: {
            code: appError.code,
            message: appError.message,
            messageId: chat.assistantMessageId,
          },
        };
      }
    }
  }

  // ── Conversations (owner-scoped) ───────────────────────────────────────────

  async listSessions(userId: string, limit: number): Promise<ChatSessionDto[]> {
    const sessions = await ChatSessionModel.find({ userId: oid(userId) })
      .sort({ lastMessageAt: -1 })
      .limit(limit)
      .lean();
    return sessions.map((s) => ({
      id: s._id.toString(),
      title: s.title,
      mode: s.mode,
      lessonId: s.lessonId ?? null,
      messageCount: s.messageCount,
      lastMessageAt: s.lastMessageAt.toISOString(),
    }));
  }

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<{ session: ChatSessionDto; messages: ChatMessageDto[] }> {
    const s = await ChatSessionModel.findOne({ _id: oid(sessionId), userId: oid(userId) }).lean();
    if (!s) throw notFound('Conversation');
    const messages = await ChatMessageModel.find({ sessionId: s._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .lean();
    return {
      session: {
        id: s._id.toString(),
        title: s.title,
        mode: s.mode,
        lessonId: s.lessonId ?? null,
        messageCount: s.messageCount,
        lastMessageAt: s.lastMessageAt.toISOString(),
      },
      messages: messages.reverse().map((m) => ({
        id: m._id.toString(),
        role: m.role as ChatMessageDto['role'],
        content: m.content,
        status: m.status as ChatMessageStatus,
        errorCode: m.errorCode ?? null,
        isMock: m.isMock,
        model: m.model ?? null,
        feedback: (m.feedback ?? null) as ChatMessageDto['feedback'],
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const s = await ChatSessionModel.findOneAndDelete({
      _id: oid(sessionId),
      userId: oid(userId),
    }).lean();
    if (!s) throw notFound('Conversation');
    await ChatMessageModel.deleteMany({ sessionId: s._id, userId: oid(userId) });
  }

  /** Deletes every conversation and message for the learner (usage metadata has no content). */
  async deleteAllSessions(userId: string): Promise<{ sessions: number; messages: number }> {
    const [sessions, messages] = await Promise.all([
      ChatSessionModel.deleteMany({ userId: oid(userId) }),
      ChatMessageModel.deleteMany({ userId: oid(userId) }),
    ]);
    return { sessions: sessions.deletedCount, messages: messages.deletedCount };
  }

  async rateMessage(
    userId: string,
    messageId: string,
    rating: 'up' | 'down' | null,
  ): Promise<void> {
    const result = await ChatMessageModel.updateOne(
      { _id: oid(messageId), userId: oid(userId), role: 'assistant' },
      { $set: { feedback: rating } },
    );
    if (result.matchedCount === 0) throw notFound('Message');
  }

  // ── Hints and explanations ─────────────────────────────────────────────────

  async hint(
    userId: string,
    input: { exerciseId: string; code: string; failures: string[]; hintsSoFar: number },
  ): Promise<HintDto> {
    const exercise = await ExerciseModel.findOne({ _id: input.exerciseId, ...LIVE })
      .select('+solution')
      .lean();
    if (!exercise) throw notFound('Exercise');
    const { context } = await this.learnerContext(userId);
    const hints = exercise.hints as LocalizedList;
    const list = context.explanationLanguage === 'en' ? hints.en : hints.hinglish;
    const curriculumHint: HintDto = {
      hint:
        list[Math.min(input.hintsSoFar, list.length - 1)] ??
        list[0] ??
        'Re-read the task and test one requirement at a time.',
      nextStep: 'Change one thing, then run the tests again.',
      concept: topicLabel(exercise.topics[0] ?? 'debugging'),
      source: 'curriculum',
      isMock: false,
    };
    if (!this.ctx.llm) return curriculumHint;
    await this.assertQuota(userId);

    const prompt = buildHintPrompt(context, {
      exercisePrompt: (exercise.prompt as LocalizedText).en,
      testNames: (exercise.tests as { name: string }[]).map((t) => t.name),
      code: input.code,
      failures: input.failures,
      hintsSoFar: input.hintsSoFar,
    });
    const started = Date.now();
    try {
      let { data, usage, result } = await this.ctx.llm.generateJson(
        { ...prompt, effort: 'low' },
        hintSchema,
      );
      if (hintLeaksSolution(data, exercise.solution)) {
        // One stricter retry; then fall back to the curriculum's own hint.
        const retry = await this.ctx.llm.generateJson(
          {
            system: prompt.system,
            messages: [
              ...prompt.messages,
              { role: 'assistant', content: JSON.stringify(data) },
              {
                role: 'user',
                content:
                  'That hint gave away too much of the solution. Give a smaller hint with no code.',
              },
            ],
            effort: 'low',
          },
          hintSchema,
        );
        usage = {
          inputTokens: usage.inputTokens + retry.usage.inputTokens,
          outputTokens: usage.outputTokens + retry.usage.outputTokens,
        };
        ({ data, result } = retry);
      }
      const leaked = hintLeaksSolution(data, exercise.solution);
      await this.record(userId, 'hint', {
        prompt: MENTOR_HINT,
        model: result.model,
        usage,
        latencyMs: Date.now() - started,
        status: 'ok',
      });
      return leaked ? curriculumHint : { ...data, source: 'ai', isMock: this.ctx.llm.isMock };
    } catch (err) {
      const error = asProviderError(err);
      await this.record(userId, 'hint', {
        prompt: MENTOR_HINT,
        latencyMs: Date.now() - started,
        status: 'error',
        errorCode: error.code,
      });
      this.ctx.logger.warn({ code: error.code }, 'AI hint failed; served curriculum hint');
      return curriculumHint;
    }
  }

  async explain(
    userId: string,
    input: { concept: string; lessonId?: string | undefined },
  ): Promise<ExplanationDto> {
    const llm = this.llm;
    await this.assertQuota(userId);
    const { context } = await this.learnerContext(userId, input.lessonId);
    const prompt = buildExplainPrompt(context, input.concept);
    const started = Date.now();
    try {
      const { data, usage, result } = await llm.generateJson(
        { ...prompt, effort: 'medium' },
        explanationSchema,
      );
      await this.record(userId, 'explain', {
        prompt: MENTOR_EXPLAIN,
        model: result.model,
        usage,
        latencyMs: Date.now() - started,
        status: 'ok',
      });
      return { ...data, isMock: llm.isMock };
    } catch (err) {
      const error = asProviderError(err);
      await this.record(userId, 'explain', {
        prompt: MENTOR_EXPLAIN,
        latencyMs: Date.now() - started,
        status: 'error',
        errorCode: error.code,
      });
      throw toAppError(error);
    }
  }

  /** Real model embeddings for the Embedding lab (only when a semantic provider is configured). */
  async labEmbeddings(userId: string, texts: string[]) {
    const provider = this.ctx.embeddings;
    if (!provider.semantic) {
      throw new AppError(
        'BAD_REQUEST',
        'No semantic embedding provider is configured; the lab computes local embeddings in your browser.',
      );
    }
    await this.assertQuota(userId);
    const started = Date.now();
    try {
      const result = await provider.embed(texts);
      await this.record(userId, 'lab-embeddings', {
        provider: provider.id,
        model: result.model,
        usage: {
          inputTokens: Math.ceil(texts.join(' ').length / 4),
          outputTokens: 0,
          estimated: true,
        },
        latencyMs: Date.now() - started,
        status: 'ok',
        isMock: false,
      });
      return {
        vectors: result.vectors,
        model: result.model,
        dimensions: result.dimensions,
        semantic: true,
      };
    } catch (err) {
      const error = asProviderError(err);
      await this.record(userId, 'lab-embeddings', {
        provider: provider.id,
        model: provider.model,
        latencyMs: Date.now() - started,
        status: 'error',
        errorCode: error.code,
        isMock: false,
      });
      throw toAppError(error);
    }
  }
}
