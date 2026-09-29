import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { GroupInvite, GroupInvitePreview, JoinGroupResult } from '@edu/contracts';
import { DomainEventBus } from '../../common/events/domain-events';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { GroupsService, groupBriefInclude, toGroupBrief } from './groups.service';

/** Токен ссылки: 18 случайных байт → 24 символа base64url. */
export const newInviteToken = () => randomBytes(18).toString('base64url');

/**
 * Ссылка-приглашение группы и вступление по ней (docs/07 F19): многоразовая ссылка на группу,
 * ученик открывает её и вступает в один тап. Таблицы — свои (groups, enrollments).
 */
@Injectable()
export class GroupInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly events: DomainEventBus,
    @InjectEnv() private readonly env: Env,
  ) {}

  /** Ссылка на `/join/:token`: её строит сервер, формат deep link MAX — workstream J. */
  inviteOf(token: string): GroupInvite {
    return { token, url: `${this.env.WEB_URL}/join/${token}` };
  }

  /** Ссылка группы; у групп, созданных без ссылки (seed), токен появляется при первом запросе. */
  async getInvite(teacherId: string, groupId: string): Promise<GroupInvite> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { inviteToken: true },
    });
    if (group.inviteToken) return this.inviteOf(group.inviteToken);
    return this.resetInvite(teacherId, groupId);
  }

  /** Новая ссылка вместо старой: по старой вступить уже нельзя. */
  async resetInvite(teacherId: string, groupId: string): Promise<GroupInvite> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const token = newInviteToken();
    await this.prisma.group.update({ where: { id: groupId }, data: { inviteToken: token } });
    return this.inviteOf(token);
  }

  /** Группа по ссылке глазами ученика: сброшенная ссылка или закрытая группа — 404. */
  async getInvitePreview(studentId: string, token: string): Promise<GroupInvitePreview> {
    const group = await this.findByToken(token);
    const [studentsCount, joined] = await Promise.all([
      this.prisma.enrollment.count({ where: { groupId: group.id, status: 'ACTIVE' } }),
      this.groups.isEnrolled(studentId, group.id),
    ]);
    return {
      token,
      group: toGroupBrief(group),
      description: group.club.description,
      schedule: group.scheduleRules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        startTime: rule.startTime,
        endTime: rule.endTime,
        room: rule.room,
      })),
      price: { amountKopecks: group.club.priceKopecks, currency: 'RUB' },
      billingPeriod: group.club.billingPeriod,
      studentsCount,
      joined,
    };
  }

  /** Вступить по ссылке. Повтор (и уже состоящий в группе ученик) ничего не меняет. */
  async join(studentId: string, token: string): Promise<JoinGroupResult> {
    const group = await this.findByToken(token);
    const { enrollmentId, created } = await this.groups.enroll(studentId, group.id);
    if (created) {
      await this.events.emit('enrollment.created', {
        enrollmentId,
        studentId,
        groupId: group.id,
        at: new Date().toISOString(),
      });
    }
    return { group: toGroupBrief(group), enrollmentId, alreadyJoined: !created };
  }

  private async findByToken(token: string) {
    const group = await this.prisma.group.findUnique({
      where: { inviteToken: token },
      include: {
        ...groupBriefInclude,
        club: {
          select: {
            ...groupBriefInclude.club.select,
            description: true,
            priceKopecks: true,
            billingPeriod: true,
            isActive: true,
          },
        },
        scheduleRules: {
          where: { validTo: null },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
    if (!group || !group.isActive || !group.club.isActive) throw Errors.notFound('Группа');
    return group;
  }
}
