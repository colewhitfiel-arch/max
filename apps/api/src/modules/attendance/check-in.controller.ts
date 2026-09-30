import { Controller } from '@nestjs/common';
import { attendanceContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { CheckInService } from './check-in.service';

/** Самоотметка ученика по QR-коду занятия (contracts/routes/attendance.ts `checkIn`). */
@Controller()
export class CheckInController {
  constructor(private readonly service: CheckInService) {}

  @TsRestHandler(attendanceContract.checkIn)
  @RequirePermission('student:attendance.check-in')
  checkIn(@CurrentUser() user: AuthUser) {
    return tsRestHandler(attendanceContract.checkIn, async ({ body }) => ({
      status: 200,
      body: await this.service.checkIn(user, body),
    }));
  }
}
