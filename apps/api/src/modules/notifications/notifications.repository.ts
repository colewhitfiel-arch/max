import { Injectable } from '@nestjs/common';
import type { NotificationSettings, NotificationType } from '@edu/contracts';
import type { Prisma } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  payload?: { entityType?: string; entityId?: string; route?: string };
}

/** Таблицы notifications и notification_settings. Только этот модуль (AGENT_GUIDE §4). */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    userId: string,
    filter: { unreadOnly?: boolean; before?: { createdAt: Date; id: string } },
    limit: number,
  ): Promise<NotificationRow[]> {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(filter.unreadOnly ? { readAt: null } : {}),
        ...(filter.before
          ? {
              OR: [
                { createdAt: { lt: filter.before.createdAt } },
                { createdAt: filter.before.createdAt, id: { lt: filter.before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Отметить прочитанными: без `ids` — все непрочитанные пользователя. */
  async markRead(userId: string, ids: string[] | undefined, readAt: Date): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt },
    });
  }

  async createMany(rows: CreateNotificationData[]): Promise<number> {
    if (rows.length === 0) return 0;
    const created = await this.prisma.notification.createMany({
      data: rows.map((row) => ({
        userId: row.userId,
        type: row.type,
        title: row.title,
        body: row.body ?? null,
        payload: (row.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
    return created.count;
  }

  /** Настройки пользователя; строки может не быть у аккаунтов, созданных до модуля. */
  async settings(userId: string): Promise<NotificationSettings> {
    const row = await this.prisma.notificationSettings.findUnique({ where: { userId } });
    return {
      lessons: row?.lessons ?? true,
      assignments: row?.assignments ?? true,
      grades: row?.grades ?? true,
      attendance: row?.attendance ?? true,
      insights: row?.insights ?? true,
      payments: row?.payments ?? true,
    };
  }

  /** Настройки группы пользователей одним запросом — рассылка по событию. */
  async settingsOf(userIds: string[]): Promise<Map<string, NotificationSettings>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.notificationSettings.findMany({
      where: { userId: { in: userIds } },
    });
    const byUser = new Map(rows.map((row) => [row.userId, row]));
    return new Map(
      userIds.map((userId) => {
        const row = byUser.get(userId);
        return [
          userId,
          {
            lessons: row?.lessons ?? true,
            assignments: row?.assignments ?? true,
            grades: row?.grades ?? true,
            attendance: row?.attendance ?? true,
            insights: row?.insights ?? true,
            payments: row?.payments ?? true,
          },
        ];
      }),
    );
  }

  async saveSettings(userId: string, data: NotificationSettings): Promise<NotificationSettings> {
    const row = await this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return {
      lessons: row.lessons,
      assignments: row.assignments,
      grades: row.grades,
      attendance: row.attendance,
      insights: row.insights,
      payments: row.payments,
    };
  }
}
