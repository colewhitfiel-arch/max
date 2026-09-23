import { Controller } from '@nestjs/common';
import { notificationsContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { NotificationsService } from './notifications.service';

/** Реализация contracts/routes/notifications.ts. */
@Controller()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @TsRestHandler(notificationsContract.listNotifications)
  @RequirePermission('common:notifications.view')
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(notificationsContract.listNotifications, async ({ query }) => ({
      status: 200,
      body: await this.service.list(user, query),
    }));
  }

  @TsRestHandler(notificationsContract.markNotificationsRead)
  @RequirePermission('common:notifications.view')
  markRead(@CurrentUser() user: AuthUser) {
    return tsRestHandler(notificationsContract.markNotificationsRead, async ({ body }) => ({
      status: 200,
      body: await this.service.markRead(user, body.ids),
    }));
  }

  @TsRestHandler(notificationsContract.getNotificationSettings)
  @RequirePermission('common:settings.edit')
  settings(@CurrentUser() user: AuthUser) {
    return tsRestHandler(notificationsContract.getNotificationSettings, async () => ({
      status: 200,
      body: await this.service.getSettings(user),
    }));
  }

  @TsRestHandler(notificationsContract.updateNotificationSettings)
  @RequirePermission('common:settings.edit')
  updateSettings(@CurrentUser() user: AuthUser) {
    return tsRestHandler(notificationsContract.updateNotificationSettings, async ({ body }) => ({
      status: 200,
      body: await this.service.updateSettings(user, body),
    }));
  }
}
