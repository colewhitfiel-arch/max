import { Injectable } from '@nestjs/common';
import {
  ATTENDANCE_QR_TTL_SEC,
  attendanceCheckInStartParam,
  type AttendanceQr,
  type CheckInBody,
  type CheckInFailureReason,
  type CheckInResult,
  type LessonDto,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { dayBounds } from '../../common/time/time';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { GroupsService } from '../groups/groups.service';
import { SchoolService } from '../school/school.service';
import { AttendanceRepository } from './attendance.repository';
import { deriveCheckInKey, signCheckInCode, verifyCheckInCode } from './check-in-code';

/** Тексты отказов самоотметки; причина уходит и в `details.reason` — по ней UI пишет своё. */
const FAILURE_MESSAGES: Record<CheckInFailureReason, string> = {
  CODE_INVALID: 'Это не QR-код занятия — отсканируйте код с экрана преподавателя',
  CODE_EXPIRED: 'QR-код устарел — отсканируйте его заново с экрана преподавателя',
  LESSON_CANCELLED: 'Занятие отменено — отмечаться на нём не нужно',
  NOT_ENROLLED: 'Ученика нет в группе этого занятия',
};

function failure(reason: CheckInFailureReason) {
  return Errors.businessRule(FAILURE_MESSAGES[reason], { reason });
}

/**
 * Отметка посещаемости по QR-коду (docs/07 F6a). Преподаватель показывает на своём экране QR
 * занятия (код живёт `ATTENDANCE_QR_TTL_SEC`, экран обновляет его сам), ученик сканирует его
 * встроенным сканером MAX, а проверку делает сервер: подпись и срок кода, занятие не отменено,
 * ученик в составе группы. Код не хранится — это подпись `(lessonId, срок)` ключом от JWT_SECRET.
 */
@Injectable()
export class CheckInService {
  private readonly log;
  private readonly key: Buffer;

  constructor(
    private readonly repo: AttendanceRepository,
    private readonly groups: GroupsService,
    private readonly school: SchoolService,
    private readonly events: DomainEventBus,
    @InjectEnv() private readonly env: Env,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'attendance' });
    this.key = deriveCheckInKey(env.JWT_SECRET);
  }

  /**
   * Свежий QR-код своего занятия. Только в день занятия (пояс школы) и не для отменённого:
   * код прошлой недели или будущего занятия — ошибка ввода, а не отметка.
   */
  async issueQr(user: AuthUser, lessonId: string, now = new Date()): Promise<AttendanceQr> {
    if (user.activeRole !== 'TEACHER' || !user.profileId)
      throw Errors.forbidden('Только для преподавателя');
    const found = await this.groups.findLesson(lessonId);
    if (!found) throw Errors.notFound('Занятие');
    if (found.teacherId !== user.profileId) throw Errors.forbidden('Занятие другого преподавателя');
    if (found.lesson.status === 'CANCELLED')
      throw Errors.businessRule('Занятие отменено — отмечаться на нём нельзя');
    const timezone = await this.school.timezone(found.schoolId);
    if (!isLessonDay(found.lesson, timezone, now))
      throw Errors.businessRule('QR-код для отметки открывается только в день занятия');

    const expiresAt = new Date((Math.floor(now.getTime() / 1000) + ATTENDANCE_QR_TTL_SEC) * 1000);
    const code = signCheckInCode(this.key, lessonId, expiresAt);
    return { lessonId, code, url: this.checkInUrl(code), expiresAt: expiresAt.toISOString() };
  }

  /**
   * Ученик отмечается по коду из QR: `PRESENT`, занятие → `DONE`, событие `attendance.marked`
   * (аналитика, уведомления, ИИ — как у отметки листом). Уже «был»/«опоздал» — повторный скан
   * ничего не меняет (`alreadyMarked`); «не был»/«уважительная» перезаписывается: ученик
   * отсканировал живой код — значит, он на занятии.
   */
  async checkIn(user: AuthUser, body: CheckInBody, now = new Date()): Promise<CheckInResult> {
    if (user.activeRole !== 'STUDENT' || !user.profileId)
      throw Errors.forbidden('Только для ученика');
    const studentId = user.profileId;

    const check = verifyCheckInCode(this.key, body.code, now);
    if (!check.ok) throw failure(check.reason);
    const found = await this.groups.findLesson(check.lessonId);
    // Подпись верна, а занятия нет (удалили вместе с группой) — для ученика это «не тот код».
    if (!found) throw failure('CODE_INVALID');
    const { lesson, groupId, teacherId } = found;
    if (lesson.status === 'CANCELLED') throw failure('LESSON_CANCELLED');
    const roster = await this.groups.listStudentIdsInGroup(groupId);
    if (!roster.includes(studentId)) throw failure('NOT_ENROLLED');

    const current = await this.repo.findStatus(lesson.id, studentId);
    if (current === 'PRESENT' || current === 'LATE') {
      return { lesson: { ...lesson, attendance: current }, status: current, alreadyMarked: true };
    }

    await this.repo.markPresent(lesson.id, studentId, teacherId, now);
    await this.groups.markLessonDone(lesson.id);
    this.log.info({ lessonId: lesson.id, studentId }, 'ученик отметился по QR');
    await this.events.emit('attendance.marked', {
      lessonId: lesson.id,
      groupId,
      rows: [{ studentId, status: 'PRESENT' }],
      markedById: teacherId,
      at: now.toISOString(),
    });
    return {
      lesson: {
        ...lesson,
        status: lesson.status === 'PLANNED' ? 'DONE' : lesson.status,
        attendance: 'PRESENT',
      },
      status: 'PRESENT',
      alreadyMarked: false,
    };
  }

  /**
   * Что зашить в QR. С именем бота — диплинк мини-приложения MAX: встроенный сканер отдаст его
   * приложению, а обычная камера телефона откроет мини-апп сразу на отметке. Без имени бота —
   * веб-адрес экрана отметки.
   */
  private checkInUrl(code: string): string {
    const bot = this.env.MAX_BOT_NAME;
    if (bot) {
      const url = new URL(`https://max.ru/${encodeURIComponent(bot)}`);
      url.searchParams.set('startapp', attendanceCheckInStartParam(code));
      return url.toString();
    }
    return `${this.env.WEB_URL.replace(/\/+$/, '')}/check-in/${encodeURIComponent(code)}`;
  }
}

/** Сейчас — день занятия в поясе школы (от начала дня старта до конца дня окончания). */
function isLessonDay(lesson: LessonDto, timezone: string, now: Date): boolean {
  const { start } = dayBounds(timezone, new Date(lesson.startsAt));
  const { end } = dayBounds(timezone, new Date(lesson.endsAt));
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}
