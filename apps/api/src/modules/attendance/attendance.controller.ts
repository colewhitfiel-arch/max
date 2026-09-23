import { Controller } from '@nestjs/common';
import { attendanceContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AttendanceService } from './attendance.service';

/** Реализация contracts/routes/attendance.ts. */
@Controller()
@RequirePermission('teacher:attendance.mark')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @TsRestHandler(attendanceContract.getAttendanceSheet)
  getSheet(@CurrentUser() user: AuthUser) {
    return tsRestHandler(attendanceContract.getAttendanceSheet, async ({ params }) => ({
      status: 200,
      body: await this.service.getSheet(user, params.lessonId),
    }));
  }

  @TsRestHandler(attendanceContract.markAttendance)
  mark(@CurrentUser() user: AuthUser) {
    return tsRestHandler(attendanceContract.markAttendance, async ({ params, body }) => ({
      status: 200,
      body: await this.service.mark(user, params.lessonId, body),
    }));
  }
}
