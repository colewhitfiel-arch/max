/** Посещаемость: лист занятия, отметка всего листа разом (docs/07 F6) и отметка по QR (F6a). */
import {
  ATTENDANCE_QR_TTL_SEC,
  AttendanceQrSchema,
  AttendanceSheetSchema,
  CheckInBodySchema,
  CheckInResultSchema,
  MarkAttendanceBodySchema,
} from '@edu/contracts';
import { http } from 'msw';
import { groupsOfTeacher, lessonDto, studentBrief, studentIdsOfGroup } from '../demo';
import { apiError, apiUrl, authed, json, readBody } from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';

/**
 * Код занятия в фейковом API — без подписи: `qr_<lessonId>_<срок в секундах>`. Подпись и её
 * проверку покрывают тесты api; здесь важны только срок и занятие.
 */
const FAKE_CODE_RE = /^qr_([0-9a-f-]{36})_(\d+)$/;

/** Занятие преподавателя: чужое — 403, несуществующее — 404 (как в API). */
function ownLesson(userId: string, lessonId: string) {
  const lesson = db.lessons.find((l) => l.id === lessonId);
  if (!lesson) return apiError('NOT_FOUND', 'Занятие не найдено');
  const teacher = teacherOfUser(userId);
  if (!teacher || !groupsOfTeacher(teacher.id).some((g) => g.id === lesson.groupId))
    return apiError('FORBIDDEN', 'Занятие другого преподавателя');
  return { lesson, teacherId: teacher.id };
}

function sheetOf(lessonId: string) {
  const lesson = db.lessons.find((l) => l.id === lessonId)!;
  return {
    lesson: lessonDto(lesson),
    rows: studentIdsOfGroup(lesson.groupId).map((studentId) => {
      const mark = db.attendance.find((a) => a.lessonId === lessonId && a.studentId === studentId);
      return {
        student: studentBrief(studentId),
        status: mark?.status ?? null,
        comment: mark?.comment ?? null,
      };
    }),
  };
}

export const attendanceHandlers = [
  http.get<{ lessonId: string }>(
    apiUrl('/teacher/lessons/:lessonId/attendance'),
    authed(
      ({ auth, params }) => {
        const own = ownLesson(auth.user.id, params.lessonId);
        if (own instanceof Response) return own;
        return json(AttendanceSheetSchema, sheetOf(params.lessonId));
      },
      ['TEACHER'],
    ),
  ),

  http.put<{ lessonId: string }>(
    apiUrl('/teacher/lessons/:lessonId/attendance'),
    authed(
      async ({ auth, params, request }) => {
        const own = ownLesson(auth.user.id, params.lessonId);
        if (own instanceof Response) return own;
        const { lesson, teacherId } = own;
        if (lesson.status === 'CANCELLED')
          return apiError('BUSINESS_RULE', 'Занятие отменено — посещаемость по нему не отмечается');
        const body = await readBody(request, MarkAttendanceBodySchema);
        if (!body.ok) return body.response;

        const enrolled = studentIdsOfGroup(lesson.groupId);
        if (body.data.rows.some((row) => !enrolled.includes(row.studentId)))
          return apiError('BUSINESS_RULE', 'В листе есть ученики не из этой группы');
        const unique = new Set(body.data.rows.map((row) => row.studentId));
        if (unique.size !== body.data.rows.length)
          return apiError('VALIDATION', 'Ученик встречается в листе дважды');

        const markedAt = new Date().toISOString();
        for (const row of body.data.rows) {
          const comment = row.comment?.trim() ? row.comment.trim() : null;
          const existing = db.attendance.find(
            (a) => a.lessonId === lesson.id && a.studentId === row.studentId,
          );
          if (existing) {
            existing.status = row.status;
            existing.comment = comment;
            existing.markedById = teacherId;
            existing.markedAt = markedAt;
          } else {
            db.attendance.push({
              id: crypto.randomUUID(),
              lessonId: lesson.id,
              studentId: row.studentId,
              status: row.status,
              comment,
              markedById: teacherId,
              markedAt,
            });
          }
        }
        if (lesson.status === 'PLANNED') lesson.status = 'DONE';
        return json(AttendanceSheetSchema, sheetOf(lesson.id));
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ lessonId: string }>(
    apiUrl('/teacher/lessons/:lessonId/attendance/qr'),
    authed(
      ({ auth, params }) => {
        const own = ownLesson(auth.user.id, params.lessonId);
        if (own instanceof Response) return own;
        if (own.lesson.status === 'CANCELLED')
          return apiError('BUSINESS_RULE', 'Занятие отменено — отмечаться на нём нельзя');
        const expiresAt = new Date(Date.now() + ATTENDANCE_QR_TTL_SEC * 1000);
        const code = `qr_${own.lesson.id}_${Math.floor(expiresAt.getTime() / 1000)}`;
        // Как у сервера без MAX_BOT_NAME; в Node-тестах `location` нет — http://localhost.
        const origin =
          typeof location !== 'undefined' && location.origin && location.origin !== 'null'
            ? location.origin
            : 'http://localhost';
        return json(AttendanceQrSchema, {
          lessonId: own.lesson.id,
          code,
          url: `${origin}/check-in/${code}`,
          expiresAt: expiresAt.toISOString(),
        });
      },
      ['TEACHER'],
    ),
  ),

  http.post(
    apiUrl('/student/attendance/check-in'),
    authed(
      async ({ auth, request }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Только для ученика');
        const body = await readBody(request, CheckInBodySchema);
        if (!body.ok) return body.response;
        const fail = (reason: string, message: string) =>
          apiError('BUSINESS_RULE', message, { reason });

        const match = FAKE_CODE_RE.exec(body.data.code);
        const lesson = match && db.lessons.find((l) => l.id === match[1]);
        if (!match || !lesson) return fail('CODE_INVALID', 'Это не QR-код занятия');
        if (Number(match[2]) * 1000 <= Date.now()) return fail('CODE_EXPIRED', 'QR-код устарел');
        if (lesson.status === 'CANCELLED') return fail('LESSON_CANCELLED', 'Занятие отменено');
        if (!studentIdsOfGroup(lesson.groupId).includes(student.id))
          return fail('NOT_ENROLLED', 'Ученика нет в группе этого занятия');

        const existing = db.attendance.find(
          (a) => a.lessonId === lesson.id && a.studentId === student.id,
        );
        if (existing && (existing.status === 'PRESENT' || existing.status === 'LATE')) {
          return json(CheckInResultSchema, {
            lesson: lessonDto(lesson, student.id),
            status: existing.status,
            alreadyMarked: true,
          });
        }
        const teacherId = db.groups.find((g) => g.id === lesson.groupId)!.teacherId;
        const markedAt = new Date().toISOString();
        if (existing) {
          existing.status = 'PRESENT';
          existing.markedById = teacherId;
          existing.markedAt = markedAt;
        } else {
          db.attendance.push({
            id: crypto.randomUUID(),
            lessonId: lesson.id,
            studentId: student.id,
            status: 'PRESENT',
            comment: null,
            markedById: teacherId,
            markedAt,
          });
        }
        if (lesson.status === 'PLANNED') lesson.status = 'DONE';
        return json(CheckInResultSchema, {
          lesson: lessonDto(lesson, student.id),
          status: 'PRESENT',
          alreadyMarked: false,
        });
      },
      ['STUDENT'],
    ),
  ),
];
