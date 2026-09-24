import { Injectable } from '@nestjs/common';
import { parentTutorPrompt } from '@edu/ai';
import type { AiMessageDto, ConversationDto, Paginated, PaginationQuery } from '@edu/contracts';
import type { AiConversation } from '@edu/db';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/logger.service';
import { FamilyService } from '../family/family.service';
import { AiRepository } from './ai.repository';
import { StudentContextBuilder } from './context-builder';
import type { SseSink } from './sse';
import { TutorService, toConversationDto } from './tutor.service';

/**
 * Тьютор родителя (F15): диалоги родителя с ИИ о ребёнке. Диалог — `AiConversation` kind TUTOR
 * с `userId` родителя и `studentId` ребёнка; доступ только к привязанным детям
 * (`FamilyService.assertParentLinked`, 403). Контекст — снимок ребёнка из StudentContextBuilder,
 * промпт — `tutor.parent`; дневной лимит общий с тьютором ученика (AI_TUTOR_DAILY_LIMIT).
 * Событие `tutor.message.sent` не публикуется: вопросы родителя — не активность ребёнка.
 */
@Injectable()
export class ParentTutorService {
  private readonly log;

  constructor(
    private readonly repo: AiRepository,
    private readonly contexts: StudentContextBuilder,
    private readonly tutor: TutorService,
    private readonly family: FamilyService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'ai.parent-tutor' });
  }

  async listConversations(
    user: AuthUser,
    studentId: string,
    query: PaginationQuery,
  ): Promise<Paginated<ConversationDto>> {
    await this.assertLinked(user, studentId);
    return this.tutor.conversationsPage(user.userId, 'TUTOR', query, { id: studentId });
  }

  async createConversation(user: AuthUser, studentId: string): Promise<ConversationDto> {
    await this.assertLinked(user, studentId);
    const row = await this.repo.createConversation({
      userId: user.userId,
      studentId,
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
    return this.tutor.messagesPage(conversation.id, query);
  }

  /** Ход диалога: проверки (404/403) → общий ход тьютора с контекстом ребёнка и промптом родителя. */
  async reply(user: AuthUser, conversationId: string, text: string, sink: SseSink): Promise<void> {
    const conversation = await this.requireOwned(user, conversationId);
    if (conversation.kind !== 'TUTOR') throw Errors.businessRule('Это не диалог с тьютором');
    const studentId = conversation.studentId;
    if (!studentId) throw Errors.notFound('Диалог');

    const result = await this.tutor.runTurn({
      userId: user.userId,
      conversation,
      text,
      sink,
      prompt: parentTutorPrompt,
      vars: async () => {
        const bundle = await this.contexts.get(studentId);
        return {
          childName: bundle?.firstName ?? bundle?.context.student.name ?? 'ребёнок',
          context: bundle?.text ?? 'Данных о ребёнке пока нет.',
        };
      },
      unavailableMessage: 'Тьютор сейчас недоступен, попробуйте позже',
    });
    if (!result) return;
    this.log.info({ conversationId: conversation.id, ...result }, 'ответ тьютора родителю');
  }

  /** Профиль родителя активной роли; без него (другая роль) — 403. */
  private parentId(user: AuthUser): string {
    if (user.activeRole !== 'PARENT' || !user.profileId) {
      throw Errors.forbidden('Доступно только в роли родителя');
    }
    return user.profileId;
  }

  private async assertLinked(user: AuthUser, studentId: string): Promise<void> {
    await this.family.assertParentLinked(this.parentId(user), studentId);
  }

  /** Свой диалог о ребёнке (иначе 404); ребёнок по-прежнему привязан (иначе 403). */
  private async requireOwned(user: AuthUser, conversationId: string): Promise<AiConversation> {
    const row = await this.repo.findConversation(conversationId);
    if (!row || row.userId !== user.userId || !row.studentId) throw Errors.notFound('Диалог');
    await this.assertLinked(user, row.studentId);
    return row;
  }
}
