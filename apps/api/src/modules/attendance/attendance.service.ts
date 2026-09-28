import { Injectable } from '@nestjs/common';
import type { AttendanceSheet, AttendanceStatus, MarkAttendanceBody } from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { GroupsService } from '../groups/groups.service';
import { AttendanceRepository } from './attendance.repository';

/**
 * Посещаемость занятия (docs/07 F6): лист по составу группы и отметка целиком.
 * Состав и занятие берутся у `GroupsService` — своя таблица у модуля одна, `attendance`.
 */
@Injectable()
export class AttendanceService {
  private readonly log;

  constructor(
    private readonly repo: AttendanceRepository,
    private readonly groups: GroupsService,
    private readonly events: DomainEventBus,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'attendance' });
  }

  /** Лист занятия: все зачисленные ученики; `status: null` — ещё не отмечен. */
  async getSheet(user: AuthUser, lessonId: string): Promise<AttendanceSheet> {
    const teacherId = this.requireTeacher(user);
    const { lesson, groupId } = await this.groups.getTeacherLesson(teacherId, lessonId);
    const [roster, marks] = await Promise.all([
      this.groups.listRoster(groupId),
      this.repo.listByLesson(lessonId),
    ]);
    const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]));
    return {
      lesson,
      rows: roster.map((student) => {
        const mark = byStudent.get(student.id);
        return {
          student,
          status: mark?.status ?? null,
          comment: mark?.comment ?? null,
        };
      }),
    };
  }

  /**
   * Отметить посещаемость: upsert всех присланных строк, занятие → DONE, событие
   * `attendance.marked`. Повторный вызов идемпотентен — перезаписывает те же строки.
   */
  async mark(user: AuthUser, lessonId: string, body: MarkAttendanceBody): Promise<AttendanceSheet> {
    const teacherId = this.requireTeacher(user);
    const { lesson, groupId } = await this.groups.getTeacherLesson(teacherId, lessonId);
    if (lesson.status === 'CANCELLED')
      throw Errors.businessRule('Занятие отменено — посещаемость по нему не отмечается');

    const roster = await this.groups.listRoster(groupId);
    const enrolled = new Set(roster.map((student) => student.id));
    const foreign = body.rows.filter((row) => !enrolled.has(row.studentId));
    if (foreign.length > 0)
      throw Errors.businessRule('В листе есть ученики не из этой группы', {
        studentIds: foreign.map((row) => row.studentId),
      });
    // Дубли по ученику в одном теле — ошибка ввода, а не «последний выигрывает».
    const unique = new Set(body.rows.map((row) => row.studentId));
    if (unique.size !== body.rows.length)
      throw Errors.validation('Ученик встречается в листе дважды');

    const markedAt = new Date();
    await this.repo.upsertMany(
      lessonId,
      teacherId,
      body.rows.map((row) => ({
        studentId: row.studentId,
        status: row.status,
        comment: row.comment?.trim() ? row.comment.trim() : null,
      })),
      markedAt,
    );
    await this.groups.markLessonDone(lessonId);
    this.log.info({ lessonId, rows: body.rows.length }, 'посещаемость отмечена');

    await this.events.emit('attendance.marked', {
      lessonId,
      groupId,
      rows: body.rows.map((row) => ({ studentId: row.studentId, status: row.status })),
      markedById: teacherId,
      at: markedAt.toISOString(),
    });
    return this.getSheet(user, lessonId);
  }

  /**
   * Публичный сервис: посещаемость учеников группы за период, по каждому ученику. Зачётные
   * занятия (`countable`) — проведённые (`DONE`), уже начавшиеся и не раньше зачисления ученика
   * в группу, минус его уважительные пропуски (`EXCUSED`) (docs/04 §4.6): неотмеченное занятие
   * (`PLANNED`) пропуском не считается, а занятия до прихода ученика (новый или возвращённый
   * в группу) ему не засчитываются. `attended` — отметки `PRESENT|LATE` на зачётных занятиях.
   */
  async attendanceOfGroup(
    groupId: string,
    studentIds: string[],
    period: { from: Date; to: Date },
  ): Promise<Map<string, { countable: number; attended: number }>> {
    const now = new Date();
    const to = period.to.getTime() < now.getTime() ? period.to : now;
    const [lessons, enrolledAt] = await Promise.all([
      this.groups.listLessons([groupId], period.from, to),
      this.groups.enrolledAtInGroup(groupId),
    ]);
    const startsAt = new Map(
      lessons
        .filter(
          (lesson) =>
            lesson.status === 'DONE' && new Date(lesson.startsAt).getTime() <= now.getTime(),
        )
        .map((lesson) => [lesson.id, new Date(lesson.startsAt).getTime()]),
    );
    const marks = await this.repo.listMarks([...startsAt.keys()], studentIds);
    return new Map(
      studentIds.map((studentId) => {
        const since = enrolledAt.get(studentId)?.getTime() ?? Number.NEGATIVE_INFINITY;
        const counts = (at: number | undefined) => at !== undefined && at >= since;
        const own = marks.filter(
          (mark) => mark.studentId === studentId && counts(startsAt.get(mark.lessonId)),
        );
        const excused = own.filter((mark) => mark.status === 'EXCUSED').length;
        return [
          studentId,
          {
            countable: [...startsAt.values()].filter(counts).length - excused,
            attended: own.filter((mark) => mark.status === 'PRESENT' || mark.status === 'LATE')
              .length,
          },
        ];
      }),
    );
  }

  /**
   * Публичный сервис: отметки ученика на конкретных занятиях (`lessonId → status`).
   * Нужны analytics для дуги недели, пропусков и опозданий, и дашбордам — для `LessonDto.attendance`.
   */
  async statusesOfStudent(
    studentId: string,
    lessonIds: string[],
  ): Promise<Map<string, AttendanceStatus>> {
    return this.repo.listStatusesOfStudent(studentId, lessonIds);
  }

  /** Сколько отметок стоит на занятиях — чтобы показать «отмечено» в списке занятий. */
  async markedCounts(lessonIds: string[]): Promise<Map<string, number>> {
    return this.repo.countByLessons(lessonIds);
  }

  private requireTeacher(user: AuthUser): string {
    if (user.activeRole !== 'TEACHER' || !user.profileId)
      throw Errors.forbidden('Только для преподавателя');
    return user.profileId;
  }
}
