import { Injectable } from '@nestjs/common';
import {
  CreateGroupBodySchema,
  type CreateGroupBody,
  type CreatedGroup,
  type GroupBrief,
  type GroupRoster,
  type StudentBrief,
  type UpdateGroupBody,
} from '@edu/contracts';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toDateOnly } from '../../common/time/time';
import { CatalogService } from '../catalog/catalog.service';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';
import { GroupInvitesService, newInviteToken } from './group-invites.service';
import { GroupsService } from './groups.service';
import { ScheduleMaterializerService } from './schedule-materializer.service';

/** Сколько кандидатов отдаёт поиск: дальше преподаватель уточняет запрос. */
const CANDIDATES_LIMIT = 50;

const fullName = (student: StudentBrief) =>
  [student.user.firstName, student.user.lastName].filter(Boolean).join(' ');

const byName = (a: StudentBrief, b: StudentBrief) => fullName(a).localeCompare(fullName(b), 'ru');

/**
 * Группы преподавателя как его рабочий инструмент (docs/07 F19): создание, название и состав.
 * Новая группа — по любому из 8 кружков: вместе с ней в каталоге школы создаётся свой кружок
 * (catalog) с ценой преподавателя, правила расписания, занятия по ним (материализация) и ссылка-
 * приглашение. Вручную добавить можно учеников его школы (профиль школы или зачисление в группу
 * её кружка) и других его групп (identity + catalog + свои зачисления): чужих детей — только по
 * ссылке. Таблицы — только свои (groups, schedule_rules, enrollments), чужое — через публичные
 * сервисы (AGENT_GUIDE §4).
 */
@Injectable()
export class GroupManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly identity: IdentityService,
    private readonly catalog: CatalogService,
    private readonly school: SchoolService,
    private readonly invites: GroupInvitesService,
    private readonly schedule: ScheduleMaterializerService,
    private readonly events: DomainEventBus,
  ) {}

  /**
   * Новая группа: свой кружок в каталоге (направление, название, описание, цена), группа со
   * ссылкой-приглашением и правила расписания (действуют с сегодняшнего дня по часам школы);
   * занятия по ним сразу появляются на 8 недель вперёд.
   */
  async createGroup(teacherId: string, input: CreateGroupBody): Promise<CreatedGroup> {
    const body = CreateGroupBodySchema.parse(input);
    const schoolId = await this.identity.getTeacherSchoolId(teacherId);
    if (!schoolId) throw Errors.forbidden('Нет профиля преподавателя');
    await this.assertTitleFree(teacherId, body.title);
    const club = await this.catalog.createClub({
      schoolId,
      title: body.title,
      description: body.description ?? '',
      category: body.category,
      priceKopecks: body.price.amountKopecks,
    });
    const today = toDateOnly(await this.school.timezone(schoolId));
    const token = newInviteToken();
    const created = await this.prisma.group.create({
      data: {
        title: body.title,
        clubId: club.id,
        teacherId,
        inviteToken: token,
        scheduleRules: {
          create: body.schedule.map((rule) => ({
            weekday: rule.weekday,
            startTime: rule.startTime,
            endTime: rule.endTime,
            room: rule.room ?? null,
            validFrom: new Date(today),
          })),
        },
      },
      select: { id: true },
    });
    if (body.schedule.length > 0)
      await this.schedule.materialize(new Date(), { groupIds: [created.id] });
    return { group: await this.brief(created.id), invite: this.invites.inviteOf(token) };
  }

  async updateGroup(
    teacherId: string,
    groupId: string,
    body: UpdateGroupBody,
  ): Promise<GroupBrief> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    await this.assertTitleFree(teacherId, body.title, groupId);
    await this.prisma.group.update({ where: { id: groupId }, data: { title: body.title } });
    return this.brief(groupId);
  }

  /** Кандидаты в группу: не в её составе, по поиску в имени/фамилии/нике, по алфавиту. */
  async listCandidates(teacherId: string, groupId: string, q?: string): Promise<StudentBrief[]> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const [allowed, members] = await Promise.all([
      this.allowedStudentIds(teacherId),
      this.groups.listStudentIdsInGroup(groupId),
    ]);
    const memberSet = new Set(members);
    const briefs = await this.identity.studentBriefsByIds(
      [...allowed].filter((id) => !memberSet.has(id)),
    );
    const needle = q?.trim().toLocaleLowerCase('ru');
    return [...briefs.values()]
      .filter(
        (student) =>
          !needle ||
          [student.user.firstName, student.user.lastName, student.user.nickname]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('ru')
            .includes(needle),
      )
      .sort(byName)
      .slice(0, CANDIDATES_LIMIT);
  }

  /**
   * Добавить ученика (идемпотентно): новое зачисление или возврат ушедшего/приостановленного.
   * Новое и возвращённое после ухода зачисление публикует `enrollment.created`.
   */
  async addStudent(teacherId: string, groupId: string, studentId: string): Promise<GroupRoster> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const allowed = await this.allowedStudentIds(teacherId);
    if (!allowed.has(studentId)) throw Errors.notFound('Ученик');

    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_groupId: { studentId, groupId } },
      select: { id: true, status: true },
    });
    let createdId: string | null = null;
    if (!existing) {
      const row = await this.prisma.enrollment.create({
        data: { studentId, groupId },
        select: { id: true },
      });
      createdId = row.id;
    } else if (existing.status !== 'ACTIVE') {
      await this.prisma.enrollment.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          leftAt: null,
          // Вернувшийся после ухода — новое зачисление: посещаемость считается с этого дня.
          ...(existing.status === 'LEFT' ? { enrolledAt: new Date() } : {}),
        },
      });
      if (existing.status === 'LEFT') createdId = existing.id;
    }
    if (createdId) {
      await this.events.emit('enrollment.created', {
        enrollmentId: createdId,
        studentId,
        groupId,
        at: new Date().toISOString(),
      });
    }
    return this.roster(groupId);
  }

  /** Убрать ученика (идемпотентно): зачисление → LEFT, оплаты и история остаются. */
  async removeStudent(teacherId: string, groupId: string, studentId: string): Promise<GroupRoster> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    await this.prisma.enrollment.updateMany({
      where: { studentId, groupId, status: { not: 'LEFT' } },
      data: { status: 'LEFT', leftAt: new Date() },
    });
    return this.roster(groupId);
  }

  // ---------- внутреннее ----------

  /**
   * Кого преподаватель может взять в группу: ученики его школы — с профилем этой школы или
   * зачисленные (не `LEFT`) в активную группу любого её кружка (так в школу попадают ученики,
   * пришедшие через онбординг: школа в их профиле не записывается), — и его активных групп.
   */
  private async allowedStudentIds(teacherId: string): Promise<Set<string>> {
    const schoolId = await this.identity.getTeacherSchoolId(teacherId);
    const clubIds = schoolId
      ? (await this.catalog.listActiveClubCards(schoolId)).map((club) => club.id)
      : [];
    const [ofSchool, enrolled] = await Promise.all([
      schoolId ? this.identity.listStudentIdsOfSchool(schoolId) : Promise.resolve([]),
      this.prisma.enrollment.findMany({
        where: {
          status: { not: 'LEFT' },
          group: { isActive: true, OR: [{ teacherId }, { clubId: { in: clubIds } }] },
        },
        select: { studentId: true },
      }),
    ]);
    return new Set([...ofSchool, ...enrolled.map((row) => row.studentId)]);
  }

  /**
   * Название уникально среди активных групп преподавателя (без учёта регистра). Сравнение — в
   * коде: `equals` + `mode: 'insensitive'` в Prisma превращается в ILIKE, где `%` и `_` в
   * названии были бы шаблонами («Группа_1» совпала бы с «Группа 1»).
   */
  private async assertTitleFree(teacherId: string, title: string, exceptGroupId?: string) {
    const groups = await this.prisma.group.findMany({
      where: {
        teacherId,
        isActive: true,
        ...(exceptGroupId ? { id: { not: exceptGroupId } } : {}),
      },
      select: { title: true },
    });
    const needle = title.toLocaleLowerCase('ru');
    if (groups.some((group) => group.title.toLocaleLowerCase('ru') === needle))
      throw Errors.conflict('Группа с таким названием уже есть');
  }

  private async brief(groupId: string): Promise<GroupBrief> {
    const brief = (await this.groups.groupBriefsByIds([groupId])).get(groupId);
    if (!brief) throw Errors.notFound('Группа');
    return brief;
  }

  private async roster(groupId: string): Promise<GroupRoster> {
    return { groupId, students: await this.groups.listRoster(groupId) };
  }
}
