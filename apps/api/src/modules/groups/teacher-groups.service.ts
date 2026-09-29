import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateGroupBody,
  CreatedGroup,
  GroupInvite,
  GroupInvitePreview,
  JoinGroupResult,
} from '@edu/contracts';
import { DomainEventBus } from '../../common/events/domain-events';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, toDateOnly, tzOffsetMinutes } from '../../common/time/time';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { CatalogService } from '../catalog/catalog.service';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';
import { GroupsService, groupBriefInclude, toGroupBrief } from './groups.service';

/** На сколько недель вперёд новая группа сразу получает занятия по своему расписанию. */
export const NEW_GROUP_LESSON_WEEKS = 8;

/** Токен ссылки: 18 случайных байт → 24 символа base64url. */
const newInviteToken = () => randomBytes(18).toString('base64url');

/**
 * Группы, которые преподаватель заводит сам, и вступление по ссылке (docs/07 F19): новая группа
 * создаётся вместе с кружком в каталоге школы и многоразовой ссылкой; ученик открывает ссылку и
 * вступает в один тап. Таблицы — свои (groups, schedule_rules, lessons, enrollments); кружок —
 * через публичный сервис catalog.
 */
@Injectable()
export class TeacherGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly catalog: CatalogService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
    private readonly events: DomainEventBus,
    @InjectEnv() private readonly env: Env,
  ) {}

  /** Новая группа: кружок в каталоге, группа со ссылкой, правила расписания и занятия на 8 недель. */
  async createGroup(teacherId: string, body: CreateGroupBody): Promise<CreatedGroup> {
    const schoolId = await this.identity.getTeacherSchoolId(teacherId);
    if (!schoolId) throw Errors.forbidden('Только для преподавателя');
    const title = body.title.trim();
    const club = await this.catalog.createClub({
      schoolId,
      title,
      description: body.description?.trim() ?? '',
      category: body.category,
      priceKopecks: body.price.amountKopecks,
    });
    const timezone = await this.school.timezone(schoolId);
    const today = toDateOnly(timezone);
    const group = await this.prisma.group.create({
      data: {
        clubId: club.id,
        teacherId,
        title,
        inviteToken: newInviteToken(),
        scheduleRules: {
          create: (body.schedule ?? []).map((rule) => ({
            weekday: rule.weekday,
            startTime: rule.startTime,
            endTime: rule.endTime,
            room: rule.room ?? null,
            validFrom: new Date(today),
          })),
        },
      },
      include: { ...groupBriefInclude, scheduleRules: true },
    });
    await this.materializeLessons(group.id, group.scheduleRules, timezone);
    return { group: toGroupBrief(group), invite: this.toInvite(group.inviteToken!) };
  }

  /** Ссылка группы; у групп, созданных до ссылок (seed), токен появляется при первом запросе. */
  async getInvite(teacherId: string, groupId: string): Promise<GroupInvite> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { inviteToken: true },
    });
    if (group.inviteToken) return this.toInvite(group.inviteToken);
    return this.resetInvite(teacherId, groupId);
  }

  /** Новая ссылка вместо старой: по старой вступить уже нельзя. */
  async resetInvite(teacherId: string, groupId: string): Promise<GroupInvite> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const { inviteToken } = await this.prisma.group.update({
      where: { id: groupId },
      data: { inviteToken: newInviteToken() },
      select: { inviteToken: true },
    });
    return this.toInvite(inviteToken!);
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

  private toInvite(token: string): GroupInvite {
    return { token, url: `${this.env.WEB_URL}/join/${token}` };
  }

  /**
   * Занятия новой группы на `NEW_GROUP_LESSON_WEEKS` недель вперёд (время правила — в поясе
   * школы). Идемпотентно по `(ruleId, startsAt)`; уже начавшиеся слоты не создаются.
   */
  private async materializeLessons(
    groupId: string,
    rules: Array<{
      id: string;
      weekday: number;
      startTime: string;
      endTime: string;
      room: string | null;
    }>,
    timezone: string,
  ): Promise<void> {
    if (rules.length === 0) return;
    const now = new Date();
    const today = new Date(`${toDateOnly(timezone, now)}T00:00:00.000Z`);
    const lessons = [];
    for (let day = 0; day < NEW_GROUP_LESSON_WEEKS * 7; day += 1) {
      const date = addDays(today, day);
      for (const rule of rules.filter((r) => r.weekday === date.getUTCDay())) {
        const startsAt = atSchoolTime(date, rule.startTime, timezone);
        if (startsAt.getTime() <= now.getTime()) continue;
        lessons.push({
          groupId,
          ruleId: rule.id,
          startsAt,
          endsAt: atSchoolTime(date, rule.endTime, timezone),
          room: rule.room,
        });
      }
    }
    await this.prisma.lesson.createMany({ data: lessons, skipDuplicates: true });
  }
}

/** Момент `HH:mm` по часам школы в дату `date` (полночь UTC этой даты). */
function atSchoolTime(date: Date, time: string, timezone: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const local = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours,
    minutes,
  );
  // Смещение берём на сам момент занятия — переходы на летнее время не сдвигают расписание.
  return new Date(local - tzOffsetMinutes(timezone, new Date(local)) * 60_000);
}
