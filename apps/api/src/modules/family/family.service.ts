import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { LinkStatus } from '@edu/contracts';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Ссылка-приглашение ребёнка живёт 7 дней (контракт `CHILD_INVITE_TTL_DAYS`). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ParentInviteRow {
  token: string;
  parentId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

/**
 * Публичный сервис модуля family (docs/08 §8.3): связи родитель ↔ ребёнок и
 * ссылки-приглашения. Таблицы `parent_student_links` и `parent_invites` читает только он;
 * экраны родителя собирает модуль `parent`, который не знает про эти таблицы.
 */
@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  async countChildren(parentId: string): Promise<number> {
    return this.prisma.parentStudentLink.count({ where: { parentId, status: 'ACTIVE' } });
  }

  async listChildStudentIds(parentId: string): Promise<string[]> {
    const links = await this.prisma.parentStudentLink.findMany({
      where: { parentId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  /** Все связи родителя, включая ожидающие подтверждения (экран «Дети»). */
  async listLinks(parentId: string): Promise<Array<{ studentId: string; status: LinkStatus }>> {
    return this.prisma.parentStudentLink.findMany({
      where: { parentId, status: { not: 'REVOKED' } },
      select: { studentId: true, status: true },
      orderBy: { requestedAt: 'asc' },
    });
  }

  /** Policy: родитель имеет доступ к данным ребёнка. */
  async assertParentLinked(parentId: string, studentId: string): Promise<void> {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
      select: { status: true },
    });
    if (!link || link.status !== 'ACTIVE')
      throw Errors.forbidden('Ребёнок не привязан к этому родителю');
  }

  async listParentUserIdsOf(studentId: string): Promise<string[]> {
    const links = await this.prisma.parentStudentLink.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { parent: { select: { userId: true } } },
    });
    return links.map((l) => l.parent.userId);
  }

  /**
   * Привязка по коду, который ученик показал родителю: подтверждения не требует —
   * код ребёнок передал лично. Повторная привязка того же ребёнка идемпотентна.
   */
  async link(parentId: string, studentId: string, status: LinkStatus): Promise<LinkStatus> {
    const now = new Date();
    const row = await this.prisma.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId, studentId } },
      create: {
        parentId,
        studentId,
        status,
        ...(status === 'ACTIVE' ? { confirmedAt: now } : {}),
      },
      // Отозванную связь восстанавливаем, уже активную не трогаем.
      update: {
        status,
        ...(status === 'ACTIVE' ? { confirmedAt: now } : {}),
      },
      select: { status: true },
    });
    return row.status;
  }

  async unlink(parentId: string, studentId: string): Promise<void> {
    const updated = await this.prisma.parentStudentLink.updateMany({
      where: { parentId, studentId, status: { not: 'REVOKED' } },
      data: { status: 'REVOKED' },
    });
    if (updated.count === 0) throw Errors.notFound('Связь с ребёнком');
  }

  // ---------- приглашения по ссылке ----------

  async createInvite(parentId: string): Promise<ParentInviteRow> {
    const token = randomBytes(24).toString('base64url');
    return this.prisma.parentInvite.create({
      data: { token, parentId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      select: { token: true, parentId: true, expiresAt: true, acceptedAt: true },
    });
  }

  async findInvite(token: string): Promise<ParentInviteRow | null> {
    return this.prisma.parentInvite.findUnique({
      where: { token },
      select: { token: true, parentId: true, expiresAt: true, acceptedAt: true },
    });
  }

  /**
   * Принять приглашение: связь становится ACTIVE, токен гасится — атомарно, в одной транзакции.
   * - повтор тем же учеником возвращает прежний результат (идемпотентно), пока связь ACTIVE;
   *   после отвязки погашенная ссылка связь не восстанавливает — `BUSINESS_RULE`;
   * - уже принятое другим учеником — `CONFLICT` (ссылка одноразовая);
   * - ученик уже привязан к этому родителю — `CONFLICT`, токен не гасится (родитель может
   *   отправить ту же ссылку другому ребёнку);
   * - истёкшее — `BUSINESS_RULE`, несуществующее — `NOT_FOUND`.
   * Гонку двух учеников по одной ссылке решает условное обновление `acceptedAt IS NULL`.
   */
  async acceptInvite(token: string, studentId: string): Promise<{ parentId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.parentInvite.findUnique({
        where: { token },
        select: { parentId: true, expiresAt: true, acceptedAt: true, acceptedBy: true },
      });
      if (!invite) throw Errors.notFound('Приглашение');
      if (invite.acceptedAt) {
        if (invite.acceptedBy !== studentId) throw Errors.conflict('Ссылка уже использована');
        // Повтор идемпотентен, пока связь жива: погашенная ссылка не восстанавливает связь,
        // которую родитель потом отвязал (для этого родитель присылает новую).
        const current = await tx.parentStudentLink.findUnique({
          where: { parentId_studentId: { parentId: invite.parentId, studentId } },
          select: { status: true },
        });
        if (current?.status !== 'ACTIVE') throw Errors.businessRule('Ссылка уже использована');
        return { parentId: invite.parentId };
      }
      const now = new Date();
      if (invite.expiresAt.getTime() <= now.getTime())
        throw Errors.businessRule('Срок действия ссылки истёк');

      const link = await tx.parentStudentLink.findUnique({
        where: { parentId_studentId: { parentId: invite.parentId, studentId } },
        select: { status: true },
      });
      if (link?.status === 'ACTIVE') {
        // Двойное нажатие: соседний запрос прочитал ту же непогашенную ссылку, но успел её
        // погасить и привязать ребёнка раньше — тогда это успех, а не «уже привязан».
        const fresh = await tx.parentInvite.findUnique({
          where: { token },
          select: { acceptedBy: true },
        });
        if (fresh?.acceptedBy === studentId) return { parentId: invite.parentId };
        throw Errors.conflict('Ребёнок уже привязан к этому родителю', { alreadyLinked: true });
      }

      const claimed = await tx.parentInvite.updateMany({
        where: { token, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedBy: studentId },
      });
      if (claimed.count === 0) {
        // Параллельный запрос успел раньше: тот же ученик (двойное нажатие) — успех, иначе конфликт.
        const winner = await tx.parentInvite.findUnique({
          where: { token },
          select: { acceptedBy: true },
        });
        if (winner?.acceptedBy === studentId) return { parentId: invite.parentId };
        throw Errors.conflict('Ссылка уже использована');
      }

      // Отозванную или ожидающую связь восстанавливаем, новой — создаём.
      await tx.parentStudentLink.upsert({
        where: { parentId_studentId: { parentId: invite.parentId, studentId } },
        create: { parentId: invite.parentId, studentId, status: 'ACTIVE', confirmedAt: now },
        update: { status: 'ACTIVE', confirmedAt: now },
      });
      return { parentId: invite.parentId };
    });
  }

  /** Связь ученика с родителем уже активна (приглашение принимать незачем). */
  async isLinked(parentId: string, studentId: string): Promise<boolean> {
    const link = await this.prisma.parentStudentLink.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
      select: { status: true },
    });
    return link?.status === 'ACTIVE';
  }
}
