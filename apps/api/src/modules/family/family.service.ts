import { Injectable } from '@nestjs/common';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Публичный сервис модуля family (docs/08 §8.3). Полные ручки родителя — задача Agent D. */
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
}
