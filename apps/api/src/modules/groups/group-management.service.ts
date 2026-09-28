import { Injectable } from '@nestjs/common';
import type {
  CreateGroupBody,
  GroupBrief,
  GroupRoster,
  StudentBrief,
  UpdateGroupBody,
} from '@edu/contracts';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { IdentityService } from '../identity/identity.service';
import { GroupsService } from './groups.service';

/** Сколько кандидатов отдаёт поиск: дальше преподаватель уточняет запрос. */
const CANDIDATES_LIMIT = 50;

const fullName = (student: StudentBrief) =>
  [student.user.firstName, student.user.lastName].filter(Boolean).join(' ');

const byName = (a: StudentBrief, b: StudentBrief) => fullName(a).localeCompare(fullName(b), 'ru');

/**
 * Группы преподавателя как его рабочий инструмент (docs/07 F19): создание, название и состав.
 * Кружок группы — из школы преподавателя (catalog), ученики — из его школы (профиль школы или
 * зачисление в группу её кружка) и других его групп (identity + catalog + свои зачисления):
 * чужих детей в группу добавить нельзя. Таблицы — только свои (groups, enrollments), чужое —
 * через публичные сервисы (AGENT_GUIDE §4).
 */
@Injectable()
export class GroupManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly identity: IdentityService,
    private readonly catalog: CatalogService,
    private readonly events: DomainEventBus,
  ) {}

  async createGroup(teacherId: string, body: CreateGroupBody): Promise<GroupBrief> {
    const schoolId = await this.identity.getTeacherSchoolId(teacherId);
    if (!schoolId) throw Errors.forbidden('Нет профиля преподавателя');
    const clubs = await this.catalog.listActiveClubCards(schoolId);
    if (!clubs.some((club) => club.id === body.clubId))
      throw Errors.validation('Кружок не найден в вашей школе');
    await this.assertTitleFree(teacherId, body.title);
    const created = await this.prisma.group.create({
      data: { title: body.title, clubId: body.clubId, teacherId },
      select: { id: true },
    });
    return this.brief(created.id);
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

  /** Название уникально среди активных групп преподавателя (без учёта регистра). */
  private async assertTitleFree(teacherId: string, title: string, exceptGroupId?: string) {
    const same = await this.prisma.group.findFirst({
      where: {
        teacherId,
        isActive: true,
        title: { equals: title, mode: 'insensitive' },
        ...(exceptGroupId ? { id: { not: exceptGroupId } } : {}),
      },
      select: { id: true },
    });
    if (same) throw Errors.conflict('Группа с таким названием уже есть');
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
