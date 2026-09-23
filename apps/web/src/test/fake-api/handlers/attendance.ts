/** Посещаемость: лист занятия и отметка всего листа разом (docs/07 F6). */
import { AttendanceSheetSchema, MarkAttendanceBodySchema } from '@edu/contracts';
import { http } from 'msw';
import { groupsOfTeacher, lessonDto, studentBrief, studentIdsOfGroup } from '../demo';
import { apiError, apiUrl, authed, json, readBody } from '../lib';
import { db, teacherOfUser } from '../state';

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
];
