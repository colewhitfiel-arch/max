import { Inject, Injectable } from '@nestjs/common';
import { AiService, type AiChatMessage, buildRequest, type Prompt, tutorPrompt } from '@edu/ai';
import type {
  AiMessageDto,
  ConversationDto,
  ConversationKind,
  ListConversationsQuery,
  Paginated,
  PaginationQuery,
} from '@edu/contracts';
import type { AiConversation, AiMessage } from '@edu/db';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { AppLogger } from '../../common/logger/logger.service';
import { decodeCursor, normalizeLimit, toPage } from '../../common/pagination/cursor';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { type ConversationCursor, type MessageCursor, AiRepository } from './ai.repository';
import { StudentContextBuilder } from './context-builder';
import type { SseSink } from './sse';

const HISTORY_LIMIT = 20;
const MAX_MESSAGE_CHARS = 2000;

export const toConversationDto = (c: AiConversation): ConversationDto => ({
  id: c.id,
  kind: c.kind,
  title: c.title,
  lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
});

export const toMessageDto = (m: AiMessage): AiMessageDto => ({
  id: m.id,
  conversationId: m.conversationId,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

/** Ход диалога с тьютором: общий для ученика и родителя (`TutorService.runTurn`). */
export interface TutorTurn<TVars> {
  userId: string;
  conversation: AiConversation;
  text: string;
  sink: SseSink;
  prompt: Prompt<TVars>;
  /** Переменные промпта (контекст ученика); вызывается после проверки дневного лимита. */
  vars: () => Promise<TVars>;
  /** Текст события `error`, если модель недоступна (тон зависит от собеседника). */
  unavailableMessage: string;
}

export interface TutorTurnResult {
  chars: number;
  failed: boolean;
}

/** Диалоги с ИИ-тьютором (F4): CRUD и стриминг ответа с учётом контекста ученика. */
@Injectable()
export class TutorService {
  private readonly log;

  constructor(
    private readonly repo: AiRepository,
    private readonly contexts: StudentContextBuilder,
    private readonly ai: AiService,
    private readonly events: DomainEventBus,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    @InjectEnv() private readonly env: Env,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'ai.tutor' });
  }

  async listConversations(
    user: AuthUser,
    query: ListConversationsQuery,
  ): Promise<Paginated<ConversationDto>> {
    // Чаты родителя о детях (studentId ребёнка) в список ученика не попадают.
    return this.conversationsPage(
      user.userId,
      query.kind,
      query,
      user.profileId ? { id: user.profileId, orUnbound: true } : undefined,
    );
  }

  /** Страница диалогов пользователя (общая для ученика и родителя). */
  async conversationsPage(
    userId: string,
    kind: ConversationKind | undefined,
    query: PaginationQuery,
    student?: { id: string; orUnbound?: boolean },
  ): Promise<Paginated<ConversationDto>> {
    const limit = normalizeLimit(query.limit);
    const rows = await this.repo.listConversations(
      userId,
      kind,
      limit,
      decodeCursor<ConversationCursor>(query.cursor),
      student,
    );
    const page = toPage(rows, limit, (last): ConversationCursor => ({
      lastMessageAt: last.lastMessageAt?.toISOString() ?? null,
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    return {
      items: page.items.map(toConversationDto),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async createConversation(user: AuthUser): Promise<ConversationDto> {
    const row = await this.repo.createConversation({
      userId: user.userId,
      studentId: user.activeRole === 'STUDENT' ? user.profileId : null,
      kind: 'TUTOR',
      title: null,
    });
    return toConversationDto(row);
  }

  async listMessages(
    user: AuthUser,
    conversationId: string,
    query: PaginationQuery,
  ): Promise<Paginated<AiMessageDto>> {
    const conversation = await this.requireOwned(user, conversationId);
    return this.messagesPage(conversation.id, query);
  }

  /** Страница сообщений диалога; доступ проверяет вызывающий. */
  async messagesPage(
    conversationId: string,
    query: PaginationQuery,
  ): Promise<Paginated<AiMessageDto>> {
    const limit = normalizeLimit(query.limit);
    const rows = await this.repo.listMessages(
      conversationId,
      limit,
      decodeCursor<MessageCursor>(query.cursor),
    );
    const page = toPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    return {
      items: page.items.map(toMessageDto),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async deleteConversation(user: AuthUser, conversationId: string): Promise<void> {
    const conversation = await this.requireOwned(user, conversationId);
    await this.repo.deleteConversation(conversation.id);
  }

  /**
   * Ход диалога ученика: проверки → общий ход (`runTurn`) → событие для аналитики.
   * Проверки до первого `sink.write` бросают обычные ошибки API (429/404).
   */
  async reply(user: AuthUser, conversationId: string, text: string, sink: SseSink): Promise<void> {
    const conversation = await this.requireOwned(user, conversationId);
    if (conversation.kind !== 'TUTOR') throw Errors.businessRule('Это не диалог с тьютором');

    const studentId =
      conversation.studentId ?? (user.activeRole === 'STUDENT' ? user.profileId : null);
    const result = await this.runTurn({
      userId: user.userId,
      conversation,
      text,
      sink,
      prompt: tutorPrompt,
      vars: async () => {
        const bundle = studentId ? await this.contexts.get(studentId) : null;
        return { context: bundle?.text ?? 'Данных об ученике пока нет.' };
      },
      unavailableMessage: 'Тьютор сейчас недоступен, попробуй позже',
    });
    if (!result) return;
    if (studentId) {
      await this.events.emit('tutor.message.sent', {
        studentId,
        conversationId: conversation.id,
        at: new Date().toISOString(),
      });
    }
    this.log.info({ conversationId: conversation.id, ...result }, 'ответ тьютора');
  }

  /**
   * Общий ход диалога (ученик и родитель): лимит → контекст (кэш 5 мин) → сохранить вопрос →
   * стрим модели → сохранить ответ. Проверки до первого `sink.write` бросают обычные ошибки API
   * (400/429). `null` — клиент ушёл до первого токена, ответ не сохранён.
   */
  async runTurn<TVars>(turn: TutorTurn<TVars>): Promise<TutorTurnResult | null> {
    const { conversation, sink, prompt } = turn;
    const question = turn.text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!question) throw Errors.validation('Пустое сообщение');
    await this.enforceDailyLimit(turn.userId);

    const vars = await turn.vars();
    const history: AiChatMessage[] = (
      await this.repo.recentMessages(conversation.id, HISTORY_LIMIT)
    ).map((m) => ({ role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content }));
    await this.repo.addMessage({
      conversationId: conversation.id,
      role: 'USER',
      content: question,
      titleIfEmpty: question.slice(0, 60),
    });
    history.push({ role: 'user', content: question });

    const request = buildRequest(prompt, vars, {
      history,
      metadata: { userId: turn.userId },
      signal: sink.signal,
    });

    let answer = '';
    let failed = false;
    for await (const chunk of this.ai.stream(request)) {
      if (chunk.type === 'token') {
        answer += chunk.text;
        sink.write({ type: 'token', text: chunk.text });
      } else if (chunk.type === 'error') {
        failed = true;
        sink.write({
          type: 'error',
          code: 'EXTERNAL_INTEGRATION',
          message: turn.unavailableMessage,
        });
      }
    }
    if (sink.signal.aborted && !answer) return null;
    if (!failed || answer) {
      const saved = await this.repo.addMessage({
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: answer || '…',
        promptId: prompt.key,
      });
      if (!failed) sink.write({ type: 'done', messageId: saved.id });
    }
    return { chars: answer.length, failed };
  }

  private async enforceDailyLimit(userId: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const used = await this.kv.incr(`ai:tutor:${userId}:${day}`, 86_400);
    if (used > this.env.AI_TUTOR_DAILY_LIMIT) {
      throw Errors.rateLimited('Лимит сообщений тьютору на сегодня исчерпан — продолжим завтра');
    }
  }

  /** Свой диалог ученика; чат родителя о ребёнке (studentId чужого профиля) — не его. */
  private async requireOwned(user: AuthUser, conversationId: string): Promise<AiConversation> {
    const row = await this.repo.findConversation(conversationId);
    if (!row || row.userId !== user.userId) throw Errors.notFound('Диалог');
    if (row.studentId && user.profileId && row.studentId !== user.profileId) {
      throw Errors.notFound('Диалог');
    }
    return row;
  }
}
