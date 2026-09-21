import { Injectable } from '@nestjs/common';
import type { ClubCard, ClubCategory } from '@edu/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/**
 * Публичный сервис модуля catalog (docs/08 §8.3): карточки кружков для рекомендаций
 * онбординга и траектории. Ручки каталога — workstream D.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Активные кружки школы (без школы — все активные) в формате ClubCard. */
  async listActiveClubCards(schoolId: string | null): Promise<ClubCard[]> {
    const clubs = await this.prisma.club.findMany({
      where: { isActive: true, ...(schoolId ? { schoolId } : {}) },
      orderBy: { title: 'asc' },
      include: {
        groups: {
          where: { isActive: true },
          include: {
            scheduleRules: { where: { validTo: null }, orderBy: { weekday: 'asc' } },
            teacher: {
              select: {
                id: true,
                photoUrl: true,
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
        },
      },
    });
    return clubs.map((club) => {
      const teachers = new Map<string, ClubCard['teachers'][number]>();
      const schedulePreview: string[] = [];
      for (const group of club.groups) {
        teachers.set(group.teacher.id, {
          id: group.teacher.id,
          user: group.teacher.user,
          photoUrl: group.teacher.photoUrl,
        });
        for (const rule of group.scheduleRules) {
          schedulePreview.push(`${WEEKDAYS[rule.weekday]} ${rule.startTime}–${rule.endTime}`);
        }
      }
      return {
        id: club.id,
        title: club.title,
        category: club.category as ClubCategory,
        coverUrl: club.coverUrl,
        description: club.description,
        price: { amountKopecks: club.priceKopecks, currency: 'RUB' as const },
        billingPeriod: 'MONTH' as const,
        tags: club.tags,
        teachers: [...teachers.values()],
        schedulePreview,
      };
    });
  }
}
