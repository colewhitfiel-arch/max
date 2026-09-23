/** Календарь и занятия групп. */
import {
  CreateLessonBodySchema,
  LessonDtoSchema,
  LessonsListSchema,
  UpdateLessonBodySchema,
} from '@edu/contracts';
import { http } from 'msw';
import { groupIdsOfStudent, groupsOfTeacher, inPeriod, lessonDto, lessonsOfGroups } from '../demo';
import { apiError, apiUrl, authed, denyForeignChild, json, periodQuery, readBody } from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';

export const groupsHandlers = [
  http.get(
    apiUrl('/student/calendar'),
    authed(
      ({ auth, request }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const q = periodQuery(request);
        if (!q.ok) return q.response;
        const lessons = inPeriod(
          lessonsOfGroups(groupIdsOfStudent(student.id)),
          q.data.from,
          q.data.to,
        );
        return json(LessonsListSchema, { lessons: lessons.map((l) => lessonDto(l, student.id)) });
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/calendar'),
    authed(
      ({ auth, params, request }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        const q = periodQuery(request);
        if (!q.ok) return q.response;
        const lessons = inPeriod(
          lessonsOfGroups(groupIdsOfStudent(params.studentId)),
          q.data.from,
          q.data.to,
        );
        return json(LessonsListSchema, {
          lessons: lessons.map((l) => lessonDto(l, params.studentId)),
        });
      },
      ['PARENT'],
    ),
  ),

  http.get(
    apiUrl('/teacher/calendar'),
    authed(
      ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const q = periodQuery(request);
        if (!q.ok) return q.response;
        // Занятия всех групп преподавателя за период (без отметок — они по ученикам).
        const groupIds = groupsOfTeacher(teacher.id).map((g) => g.id);
        const lessons = inPeriod(lessonsOfGroups(groupIds), q.data.from, q.data.to);
        return json(LessonsListSchema, { lessons: lessons.map((l) => lessonDto(l)) });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ groupId: string }>(
    apiUrl('/teacher/groups/:groupId/lessons'),
    authed(
      ({ auth, params, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher || !groupsOfTeacher(teacher.id).some((g) => g.id === params.groupId)) {
          return apiError('FORBIDDEN', 'Чужая группа');
        }
        const q = periodQuery(request);
        if (!q.ok) return q.response;
        const lessons = inPeriod(lessonsOfGroups([params.groupId]), q.data.from, q.data.to);
        return json(LessonsListSchema, { lessons: lessons.map((l) => lessonDto(l)) });
      },
      ['TEACHER'],
    ),
  ),

  http.post<{ groupId: string }>(
    apiUrl('/teacher/groups/:groupId/lessons'),
    authed(
      async ({ auth, params, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher || !groupsOfTeacher(teacher.id).some((g) => g.id === params.groupId)) {
          return apiError('FORBIDDEN', 'Чужая группа');
        }
        const body = await readBody(request, CreateLessonBodySchema);
        if (!body.ok) return body.response;
        if (new Date(body.data.endsAt).getTime() <= new Date(body.data.startsAt).getTime()) {
          return apiError('VALIDATION', 'Занятие должно заканчиваться позже начала');
        }
        const lesson = {
          id: crypto.randomUUID(),
          groupId: params.groupId,
          ruleId: null,
          startsAt: body.data.startsAt,
          endsAt: body.data.endsAt,
          topic: body.data.topic ?? null,
          room: body.data.room ?? null,
          status: 'PLANNED' as const,
          cancelReason: null,
        };
        db.lessons.push(lesson);
        return json(LessonDtoSchema, lessonDto(lesson));
      },
      ['TEACHER'],
    ),
  ),

  http.patch<{ lessonId: string }>(
    apiUrl('/teacher/lessons/:lessonId'),
    authed(
      async ({ auth, params, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        const lesson = db.lessons.find((l) => l.id === params.lessonId);
        if (!lesson) return apiError('NOT_FOUND', 'Занятие не найдено');
        if (!teacher || !groupsOfTeacher(teacher.id).some((g) => g.id === lesson.groupId)) {
          return apiError('FORBIDDEN', 'Чужая группа');
        }
        const body = await readBody(request, UpdateLessonBodySchema);
        if (!body.ok) return body.response;
        if (body.data.topic !== undefined) lesson.topic = body.data.topic;
        if (body.data.room !== undefined) lesson.room = body.data.room;
        if (body.data.status === 'CANCELLED') {
          lesson.status = 'CANCELLED';
          lesson.cancelReason = body.data.cancelReason ?? null;
        }
        return json(LessonDtoSchema, lessonDto(lesson));
      },
      ['TEACHER'],
    ),
  ),
];
