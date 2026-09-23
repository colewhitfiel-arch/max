import { Injectable } from '@nestjs/common';
import type {
  ListNotificationsQuery,
  NotificationDto,
  NotificationSettings,
  NotificationType,
  NotificationsPage,
  UnreadCount,
} from '@edu/contracts';
import { IdSchema } from '@edu/contracts';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppLogger } from '../../common/logger/logger.service';
import { decodeCursor, normalizeLimit, toPage } from '../../common/pagination/cursor';
import {
  type CreateNotificationData,
  type NotificationRow,
  NotificationsRepository,
} from './notifications.repository';

const NotificationCursorSchema = z.object({ createdAt: z.string().datetime(), id: IdSchema });

/**
 * Какая галочка в настройках выключает уведомление этого типа (docs/04, `NotificationSettings`).
 * Тип без галочки слать нельзя — компилятор не даст забыть новый тип.
 */
const SETTING_OF: Record<NotificationType, keyof NotificationSettings> = {
  LESSON_SOON: 'lessons',
  LESSON_CANCELLED: 'lessons',
  ASSIGNMENT_NEW: 'assignments',
  ASSIGNMENT_DUE: 'assignments',
  ASSIGNMENT_GRADED: 'grades',
  ATTENDANCE_ABSENT: 'attendance',
  SUBMISSION_RECEIVED: 'assignments',
  COURSE_PUBLISHED: 'assignments',
  PAYMENT_DUE: 'payments',
  PAYMENT_SUCCEEDED: 'payments',
  GENERATION_DONE: 'insights',
  INSIGHT_READY: 'insights',
};

const toDto = (row: NotificationRow): NotificationDto => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  payload: (row.payload as NotificationDto['payload']) ?? null,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Центр уведомлений (docs/07 F13): лента со счётчиком непрочитанных, отметка о прочтении и
 * настройки. Сами уведомления создают обработчики доменных событий (`notifications.events.ts`)
 * через публичный `notify` — он же отсекает адресатов, выключивших этот тип в настройках.
 */
@Injectable()
export class NotificationsService {
  private readonly log;

  constructor(
    private readonly repo: NotificationsRepository,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'notifications' });
  }

  async list(user: AuthUser, query: ListNotificationsQuery): Promise<NotificationsPage> {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor, NotificationCursorSchema);
    const rows = await this.repo.list(
      user.userId,
      {
        ...(query.unreadOnly ? { unreadOnly: true } : {}),
        ...(cursor ? { before: { createdAt: new Date(cursor.createdAt), id: cursor.id } } : {}),
      },
      limit,
    );
    const page = toPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
    return {
      items: page.items.map(toDto),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      unreadCount: await this.repo.countUnread(user.userId),
    };
  }

  async markRead(user: AuthUser, ids: string[] | undefined): Promise<UnreadCount> {
    await this.repo.markRead(user.userId, ids?.length ? ids : undefined, new Date());
    return { unreadCount: await this.repo.countUnread(user.userId) };
  }

  getSettings(user: AuthUser): Promise<NotificationSettings> {
    return this.repo.settings(user.userId);
  }

  updateSettings(user: AuthUser, body: NotificationSettings): Promise<NotificationSettings> {
    return this.repo.saveSettings(user.userId, body);
  }

  /** Публичный сервис: последние уведомления пользователя (лента событий на главной). */
  async latestOf(userId: string, limit: number): Promise<NotificationDto[]> {
    const rows = await this.repo.list(userId, {}, limit);
    return rows.slice(0, limit).map(toDto);
  }

  /**
   * Публичный сервис: разослать уведомление адресатам, у которых этот тип включён.
   * Дубли (`userIds` с повторами) схлопываются; пустой список — no-op.
   */
  async notify(
    userIds: string[],
    data: Omit<CreateNotificationData, 'userId'>,
  ): Promise<number> {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return 0;
    const settings = await this.repo.settingsOf(unique);
    const allowed = unique.filter((userId) => settings.get(userId)?.[SETTING_OF[data.type]] ?? true);
    const created = await this.repo.createMany(allowed.map((userId) => ({ userId, ...data })));
    if (created > 0) this.log.info({ type: data.type, count: created }, 'уведомления созданы');
    return created;
  }
}
