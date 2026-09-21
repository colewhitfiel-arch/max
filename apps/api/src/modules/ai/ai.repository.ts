import { Injectable } from '@nestjs/common';
import type { ConversationKind, MessageRole, TrajectoryContent } from '@edu/contracts';
import { type AiConversation, type AiMessage, Prisma, type Trajectory } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type MessageCursor = { createdAt: string; id: string };

/** Таблицы ai_conversations, ai_messages, trajectories. Только этот модуль. */
@Injectable()
export class AiRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- диалоги ----------

  async createConversation(data: {
    userId: string;
    studentId: string | null;
    kind: ConversationKind;
    title: string | null;
  }): Promise<AiConversation> {
    return this.prisma.aiConversation.create({ data });
  }

  async findConversation(id: string): Promise<AiConversation | null> {
    return this.prisma.aiConversation.findUnique({ where: { id } });
  }

  async listConversations(
    userId: string,
    kind: ConversationKind | undefined,
    limit: number,
    cursor: MessageCursor | null,
  ): Promise<AiConversation[]> {
    return this.prisma.aiConversation.findMany({
      where: {
        userId,
        ...(kind ? { kind } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.prisma.aiConversation.delete({ where: { id } });
  }

  async setConversationSnapshot(id: string, snapshot: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.aiConversation.update({ where: { id }, data: { contextSnapshot: snapshot } });
  }

  async latestConversation(userId: string, kind: ConversationKind): Promise<AiConversation | null> {
    return this.prisma.aiConversation.findFirst({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------- сообщения ----------

  async addMessage(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
    promptId?: string;
    tokensIn?: number;
    tokensOut?: number;
    /** Заголовок диалога по первому сообщению ученика. */
    titleIfEmpty?: string;
  }): Promise<AiMessage> {
    const { titleIfEmpty, ...rest } = data;
    const [message] = await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: rest }),
      this.prisma.aiConversation.update({
        where: { id: data.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    if (titleIfEmpty) {
      await this.prisma.aiConversation.updateMany({
        where: { id: data.conversationId, title: null },
        data: { title: titleIfEmpty },
      });
    }
    return message;
  }

  /** Последние N сообщений в хронологическом порядке. */
  async recentMessages(conversationId: string, take: number): Promise<AiMessage[]> {
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.reverse();
  }

  async listMessages(
    conversationId: string,
    limit: number,
    cursor: MessageCursor | null,
  ): Promise<AiMessage[]> {
    return this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
  }

  async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    return this.prisma.aiMessage.count({
      where: { role: 'USER', createdAt: { gte: since }, conversation: { userId, kind: 'TUTOR' } },
    });
  }

  // ---------- траектория ----------

  async latestTrajectory(studentId: string): Promise<Trajectory | null> {
    return this.prisma.trajectory.findFirst({
      where: { studentId },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async createTrajectory(data: {
    studentId: string;
    content: TrajectoryContent;
    promptId: string;
    sourceHash: string;
  }): Promise<Trajectory> {
    return this.prisma.trajectory.create({
      data: { ...data, content: data.content as Prisma.InputJsonValue },
    });
  }
}
