import { Injectable } from '@nestjs/common';
import type { GroupBrief, LessonDto, StudentBrief } from '@edu/contracts';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Вложенные связи, из которых собирается `GroupBrief`. */
const groupBriefInclude = {
  club: { select: { id: true, title: true, category: true, coverUrl: true } },
  teacher: {
    select: {
      id: true,
      photoUrl: true,
      user: {
        select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true },
      },
    },
  },
} as const;

type GroupWithBrief = {
  id: string;
  title: string;
  club: { id: string; title: string; category: string; coverUrl: string | null };
  teacher: {
    id: string;
    photoUrl: string | null;
    user: {
      id: string;
      firstName: string;
      lastName: string | null;
      nickname: string | null;
      avatarUrl: string | null;
    };
  };
};

function toGroupBrief(group: GroupWithBrief): GroupBrief {
  return {
    id: group.id,
    title: group.title,
    // Group.code в модели данных пока нет (docs/04) — UI покажет title.
    code: null,
    club: group.club as GroupBrief['club'],
    teacher: { id: group.teacher.id, user: group.teacher.user, photoUrl: group.teacher.photoUrl },
  };
}

/**
 * Публичный сервис модуля groups (docs/08 §8.3): policy владения группой, зачисление и
 * read-методы по группам, занятиям и составу, которыми пользуются attendance, assignments,
 * courses и course-builder (чужой модуль не читает таблицы groups напрямую, AGENT_GUIDE §4).
 */
@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Policy: группа принадлежит преподавателю. */
  async assertTeacherOwnsGroup(teacherId: string, groupId: string): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { teacherId: true },
    });
    if (!group) throw Errors.notFound('Группа');
    if (group.teacherId !== teacherId)
      throw Errors.forbidden('Группа принадлежит другому преподавателю');
  }

  async listGroupsByTeacher(
    teacherId: string,
  ): Promise<Array<{ id: string; title: string; clubId: string }>> {
    return this.prisma.group.findMany({
      where: { teacherId, isActive: true },
      select: { id: true, title: true, clubId: true },
      orderBy: { title: 'asc' },
    });
  }

  async listStudentIdsInGroup(groupId: string): Promise<string[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  /** Состав группы (ACTIVE) для листов посещаемости и выбора адресатов задания. */
  async listRoster(groupId: string): Promise<StudentBrief[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { groupId, status: 'ACTIVE' },
      select: {
        student: {
          select: {
            id: true,
            classLabel: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
    return rows
      .map(({ student }) => ({
        id: student.id,
        user: student.user,
        classLabel: student.classLabel,
      }))
      .sort((a, b) =>
        `${a.user.firstName} ${a.user.lastName ?? ''}`.localeCompare(
          `${b.user.firstName} ${b.user.lastName ?? ''}`,
          'ru',
        ),
      );
  }

  /** Группы ученика (ACTIVE-зачисления) — по ним видны задания и курсы. */
  async listGroupIdsOfStudent(studentId: string): Promise<string[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { groupId: true },
    });
    return rows.map((row) => row.groupId);
  }

  /**
   * Зачисления ученика с датой начала: посещаемость считается только по занятиям,
   * которые прошли после зачисления (docs/04 §4.6).
   */
  async listEnrollmentsOfStudent(
    studentId: string,
  ): Promise<Array<{ groupId: string; enrolledAt: Date }>> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { groupId: true, enrolledAt: true },
    });
    return rows;
  }

  /** Группы ученика как `GroupBrief` (карта кружков на экране заданий). */
  async listGroupBriefsOfStudent(studentId: string): Promise<GroupBrief[]> {
    const rows = await this.prisma.group.findMany({
      where: { enrollments: { some: { studentId, status: 'ACTIVE' } } },
      select: { id: true, title: true, ...groupBriefInclude },
      orderBy: { title: 'asc' },
    });
    return rows.map(toGroupBrief);
  }

  /** Группы преподавателя как `GroupBrief` (для списков заданий, курсов и занятий). */
  async listGroupBriefsByTeacher(teacherId: string): Promise<GroupBrief[]> {
    const rows = await this.prisma.group.findMany({
      where: { teacherId, isActive: true },
      select: { id: true, title: true, ...groupBriefInclude },
      orderBy: { title: 'asc' },
    });
    return rows.map(toGroupBrief);
  }

  /** `GroupBrief` по id; несуществующие id просто не попадают в map. */
  async groupBriefsByIds(groupIds: string[]): Promise<Map<string, GroupBrief>> {
    const unique = [...new Set(groupIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.group.findMany({
      where: { id: { in: unique } },
      select: { id: true, title: true, ...groupBriefInclude },
    });
    return new Map(rows.map((row) => [row.id, toGroupBrief(row)]));
  }

  /**
   * Занятие преподавателя с группой. Чужое занятие — 403, несуществующее — 404
   * (policy одна для всех модулей, чтобы «чужой lessonId» везде отвечал одинаково).
   */
  async getTeacherLesson(
    teacherId: string,
    lessonId: string,
  ): Promise<{ lesson: LessonDto; groupId: string }> {
    const row = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        group: { select: { id: true, title: true, teacherId: true, ...groupBriefInclude } },
      },
    });
    if (!row) throw Errors.notFound('Занятие');
    if (row.group.teacherId !== teacherId) throw Errors.forbidden('Занятие другого преподавателя');
    return {
      lesson: {
        id: row.id,
        groupId: row.groupId,
        ruleId: row.ruleId,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        topic: row.topic,
        room: row.room,
        status: row.status,
        cancelReason: row.cancelReason,
        group: toGroupBrief(row.group),
      },
      groupId: row.groupId,
    };
  }

  /** Занятия групп за период (границы включительно), по возрастанию начала. */
  async listLessons(groupIds: string[], from: Date, to: Date): Promise<LessonDto[]> {
    if (groupIds.length === 0) return [];
    const rows = await this.prisma.lesson.findMany({
      where: { groupId: { in: groupIds }, startsAt: { gte: from, lte: to } },
      include: { group: { select: { id: true, title: true, ...groupBriefInclude } } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      ruleId: row.ruleId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      topic: row.topic,
      room: row.room,
      status: row.status,
      cancelReason: row.cancelReason,
      group: toGroupBrief(row.group),
    }));
  }

  /** Разовое занятие в группе преподавателя. */
  async createLesson(
    teacherId: string,
    groupId: string,
    body: { startsAt: string; endsAt: string; topic?: string; room?: string },
  ): Promise<LessonDto> {
    await this.assertTeacherOwnsGroup(teacherId, groupId);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt.getTime() <= startsAt.getTime())
      throw Errors.validation('Занятие должно заканчиваться позже начала');
    const created = await this.prisma.lesson.create({
      data: {
        groupId,
        startsAt,
        endsAt,
        topic: body.topic ?? null,
        room: body.room ?? null,
      },
      select: { id: true },
    });
    const { lesson } = await this.getTeacherLesson(teacherId, created.id);
    return lesson;
  }

  /** Тема/кабинет занятия или его отмена. */
  async updateLesson(
    teacherId: string,
    lessonId: string,
    body: {
      topic?: string | null;
      room?: string | null;
      status?: 'CANCELLED';
      cancelReason?: string;
    },
  ): Promise<LessonDto> {
    await this.getTeacherLesson(teacherId, lessonId);
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.room !== undefined ? { room: body.room } : {}),
        ...(body.status === 'CANCELLED'
          ? { status: 'CANCELLED' as const, cancelReason: body.cancelReason ?? null }
          : {}),
      },
    });
    const { lesson } = await this.getTeacherLesson(teacherId, lessonId);
    return lesson;
  }

  /** Перевести занятие в DONE после отметки посещаемости (идемпотентно, отменённое не трогаем). */
  async markLessonDone(lessonId: string): Promise<void> {
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, status: { in: ['PLANNED', 'DONE'] } },
      data: { status: 'DONE' },
    });
  }

  async isEnrolled(studentId: string, groupId: string): Promise<boolean> {
    const row = await this.prisma.enrollment.findUnique({
      where: { studentId_groupId: { studentId, groupId } },
      select: { status: true },
    });
    return !!row && row.status !== 'LEFT';
  }

  async findFirstActiveGroupOfClub(clubId: string): Promise<{ id: string } | null> {
    return this.prisma.group.findFirst({
      where: { clubId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Зачислить ученика в группу (идемпотентно). */
  async enroll(
    studentId: string,
    groupId: string,
  ): Promise<{ enrollmentId: string; created: boolean }> {
    const existing = await this.prisma.enrollment.findUnique({
      where: { studentId_groupId: { studentId, groupId } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'LEFT') {
        await this.prisma.enrollment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', leftAt: null, enrolledAt: new Date() },
        });
        return { enrollmentId: existing.id, created: true };
      }
      return { enrollmentId: existing.id, created: false };
    }
    const row = await this.prisma.enrollment.create({
      data: { studentId, groupId },
      select: { id: true },
    });
    return { enrollmentId: row.id, created: true };
  }
}
