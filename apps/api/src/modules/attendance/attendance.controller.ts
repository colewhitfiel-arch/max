import { Controller } from '@nestjs/common';
import { attendanceContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AttendanceService } from './attendance.service';
import { CheckInService } from './check-in.service';

/** Реализация contracts/routes/attendance.ts: лист преподавателя и QR-код занятия. */
@Controller()
@RequirePermission('teacher:attendance.mark')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly checkIn: CheckInService,
  ) {}

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

  @TsRestHandler(attendanceContract.getAttendanceQr)
  getQr(@CurrentUser() user: AuthUser) {
    return tsRestHandler(attendanceContract.getAttendanceQr, async ({ params }) => ({
      status: 200,
      body: await this.checkIn.issueQr(user, params.lessonId),
    }));
  }
}
