import { Injectable } from '@nestjs/common';
import type {
  ClubInterestStatus,
  ConversationKind,
  MessageRole,
  TrajectoryContent,
} from '@edu/contracts';
import {
  type AiConversation,
  type AiMessage,
  Prisma,
  type StudentClubInterest,
  type Trajectory,
} from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type MessageCursor = { createdAt: string; id: string };

/**
 * Курсор списка диалогов — все ключи его сортировки: `lastMessageAt desc nulls last`,
 * `createdAt desc`, `id desc`. `lastMessageAt: null` — диалог без сообщений (они в конце).
 */
export type ConversationCursor = { lastMessageAt: string | null; createdAt: string; id: string };

/** Строки строго после курсора в порядке `lastMessageAt desc nulls last, createdAt desc, id desc`. */
function afterConversationCursor(cursor: ConversationCursor): Prisma.AiConversationWhereInput {
  const createdAt = new Date(cursor.createdAt);
  const sameOrOlder: Prisma.AiConversationWhereInput = {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
  };
  if (!cursor.lastMessageAt) {
    // Курсор среди диалогов без сообщений — дальше только они же.
    return { AND: [{ lastMessageAt: null }, sameOrOlder] };
  }
  const lastMessageAt = new Date(cursor.lastMessageAt);
  return {
    OR: [
      { lastMessageAt: { lt: lastMessageAt } },
      { AND: [{ lastMessageAt }, sameOrOlder] },
      { lastMessageAt: null },
    ],
  };
}

export interface ClubInterestInput {
  clubId: string;
  status: ClubInterestStatus;
  score: number | null;
  reason: string | null;
}

export interface ClubDemandRow {
  clubId: string;
  status: ClubInterestStatus;
  count: number;
  avgScore: number | null;
}

/** Таблицы ai_conversations, ai_messages, trajectories, student_club_interests. Только этот модуль. */
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

  /**
   * Диалоги пользователя. `student` сужает выборку до диалогов об этом ученике
   * (`orUnbound` — плюс диалоги без ученика): так чаты родителя о детях не смешиваются
   * с собственными чатами ученика у одного и того же пользователя.
   */
  async listConversations(
    userId: string,
    kind: ConversationKind | undefined,
    limit: number,
    cursor: ConversationCursor | null,
    student?: { id: string; orUnbound?: boolean },
  ): Promise<AiConversation[]> {
    return this.prisma.aiConversation.findMany({
      where: {
        userId,
        ...(kind ? { kind } : {}),
        AND: [
          student
            ? student.orUnbound
              ? { OR: [{ studentId: student.id }, { studentId: null }] }
              : { studentId: student.id }
            : {},
          // Курсор — по тем же ключам, что и сортировка: иначе страницы теряют диалоги.
          cursor ? afterConversationCursor(cursor) : {},
        ],
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

  async updateConversation(
    id: string,
    data: { kind?: ConversationKind; title?: string | null },
  ): Promise<void> {
    await this.prisma.aiConversation.update({ where: { id }, data });
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

  /**
   * Вопросы ученика тьютору за период: только его собственные диалоги (о нём или без ученика).
   * Диалоги того же пользователя в роли родителя — о других детях — активностью ученика не считаются.
   */
  async countUserMessagesSince(userId: string, studentId: string, since: Date): Promise<number> {
    return this.prisma.aiMessage.count({
      where: {
        role: 'USER',
        createdAt: { gte: since },
        conversation: {
          userId,
          kind: 'TUTOR',
          OR: [{ studentId }, { studentId: null }],
        },
      },
    });
  }

  // ---------- спрос на кружки (онбординг) ----------

  /** Один ряд на пару ученик–кружок: повторный онбординг перезаписывает статус и причину. */
  async replaceClubInterests(studentId: string, rows: ClubInterestInput[]): Promise<void> {
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.studentClubInterest.upsert({
          where: { studentId_clubId: { studentId, clubId: row.clubId } },
          create: { studentId, ...row },
          update: { status: row.status, score: row.score, reason: row.reason },
        }),
      ),
    );
  }

  async listClubInterests(
    studentId: string,
    status?: ClubInterestStatus,
  ): Promise<Array<StudentClubInterest & { club: { title: string } }>> {
    return this.prisma.studentClubInterest.findMany({
      where: { studentId, ...(status ? { status } : {}) },
      include: { club: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Счётчики и средняя оценка по кружкам школы в разрезе статуса. */
  async clubDemandRows(schoolId: string): Promise<ClubDemandRow[]> {
    const grouped = await this.prisma.studentClubInterest.groupBy({
      by: ['clubId', 'status'],
      where: { club: { schoolId } },
      _count: { _all: true },
      _avg: { score: true },
    });
    return grouped.map((g) => ({
      clubId: g.clubId,
      status: g.status,
      count: g._count._all,
      avgScore: g._avg.score,
    }));
  }

  /** Причины интереса (CHOSEN/LATER) по кружкам школы — для «типичных причин». */
  async clubInterestReasons(schoolId: string): Promise<Array<{ clubId: string; reason: string }>> {
    const rows = await this.prisma.studentClubInterest.findMany({
      where: { club: { schoolId }, status: { in: ['CHOSEN', 'LATER'] }, reason: { not: null } },
      select: { clubId: true, reason: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return rows.flatMap((r) => (r.reason ? [{ clubId: r.clubId, reason: r.reason }] : []));
  }

  /** Ученики, у которых есть хоть один ряд спроса по кружкам школы: их «на будущее» из профиля. */
  async futureInterestsOfSchool(
    schoolId: string,
  ): Promise<Array<{ studentId: string; futureInterests: string[] }>> {
    const rows = await this.prisma.studentProfile.findMany({
      where: { clubInterests: { some: { club: { schoolId } } } },
      select: { id: true, futureInterests: true },
    });
    return rows.map((r) => ({ studentId: r.id, futureInterests: r.futureInterests }));
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
