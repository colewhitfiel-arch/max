import { Controller } from '@nestjs/common';
import { supportContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { SupportService } from './support.service';

/** Реализация contracts/routes/support.ts. */
@Controller()
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @TsRestHandler(supportContract.createTicket)
  @RequirePermission('common:support.create')
  create(@CurrentUser() user: AuthUser) {
    return tsRestHandler(supportContract.createTicket, async ({ body }) => ({
      status: 200,
      body: await this.service.create(user, body),
    }));
  }

  @TsRestHandler(supportContract.listTickets)
  @RequirePermission('common:support.create')
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(supportContract.listTickets, async () => ({
      status: 200,
      body: await this.service.list(user),
    }));
  }
}
