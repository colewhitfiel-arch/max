import { Injectable } from '@nestjs/common';
import type { AttendanceStatus } from '@edu/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  comment: string | null;
}

export interface AttendanceUpsert {
  studentId: string;
  status: AttendanceStatus;
  comment: string | null;
}

/** Таблица attendance. Только этот модуль (AGENT_GUIDE §4). */
@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByLesson(lessonId: string): Promise<AttendanceRecord[]> {
    return this.prisma.attendance.findMany({
      where: { lessonId },
      select: { studentId: true, status: true, comment: true },
    });
  }

  /** Отметки `PRESENT|LATE` по ученикам на перечисленных занятиях. */
  async countPresentByStudent(
    lessonIds: string[],
    studentIds: string[],
  ): Promise<Map<string, number>> {
    if (lessonIds.length === 0 || studentIds.length === 0) return new Map();
    const rows = await this.prisma.attendance.groupBy({
      by: ['studentId'],
      where: {
        lessonId: { in: lessonIds },
        studentId: { in: studentIds },
        status: { in: ['PRESENT', 'LATE'] },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.studentId, row._count._all]));
  }

  /** Сколько отметок уже стоит на занятии (для «отмечено / не отмечено» в списке). */
  async countByLessons(lessonIds: string[]): Promise<Map<string, number>> {
    if (lessonIds.length === 0) return new Map();
    const rows = await this.prisma.attendance.groupBy({
      by: ['lessonId'],
      where: { lessonId: { in: lessonIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.lessonId, row._count._all]));
  }

  /**
   * Upsert всех строк одной транзакцией: повторный PUT с тем же телом не создаёт дублей
   * (уникальный индекс lessonId+studentId) и переписывает статус/комментарий.
   */
  async upsertMany(
    lessonId: string,
    markedById: string,
    rows: AttendanceUpsert[],
    markedAt: Date,
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.attendance.upsert({
          where: { lessonId_studentId: { lessonId, studentId: row.studentId } },
          create: {
            lessonId,
            studentId: row.studentId,
            status: row.status,
            comment: row.comment,
            markedById,
            markedAt,
          },
          update: { status: row.status, comment: row.comment, markedById, markedAt },
        }),
      ),
    );
  }
}
