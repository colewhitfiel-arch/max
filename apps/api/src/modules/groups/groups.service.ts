import { Injectable } from '@nestjs/common';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Публичный сервис модуля groups (docs/08 §8.3). Минимальный набор, нужный course-builder
 * (policy владения группой) и онбордингу (зачисление). Полный модуль — workstream E.
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
