import { Injectable } from '@nestjs/common';
import type { SchoolBrief, SchoolSettings } from '@edu/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Публичный сервис модуля school (docs/08 §8.3): школа, политики, код приглашения. */
@Injectable()
export class SchoolService {
  constructor(private readonly prisma: PrismaService) {}

  async getBrief(schoolId: string): Promise<SchoolBrief | null> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    return school;
  }

  async getSettings(schoolId: string): Promise<SchoolSettings> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { settings: true },
    });
    const settings = (school?.settings ?? {}) as Partial<SchoolSettings>;
    return { showTeacherContacts: settings.showTeacherContacts ?? false };
  }

  async timezone(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { timezone: true },
    });
    return school?.timezone ?? 'Europe/Moscow';
  }

  async findByInviteCode(inviteCode: string): Promise<{ id: string } | null> {
    return this.prisma.school.findUnique({ where: { inviteCode }, select: { id: true } });
  }
}
