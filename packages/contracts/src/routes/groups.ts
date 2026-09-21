/**
 * Календарь и занятия групп. Владелец — B2.
 * docs/05-api-contracts.md §5.3 `groups.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateTimeSchema, IdSchema, PeriodQuerySchema } from '../common';
import { LessonDtoSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const LessonsListSchema = z.object({ lessons: z.array(LessonDtoSchema) });
export type LessonsList = z.infer<typeof LessonsListSchema>;

// ---------- Тела запросов ----------

export const CreateLessonBodySchema = z.object({
  startsAt: DateTimeSchema,
  endsAt: DateTimeSchema,
  topic: z.string().min(1).optional(),
  room: z.string().min(1).optional(),
});
export type CreateLessonBody = z.infer<typeof CreateLessonBodySchema>;

/** null в topic/room — очистить поле. Отмена — `status: 'CANCELLED'` (+ причина). */
export const UpdateLessonBodySchema = z.object({
  topic: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  status: z.literal('CANCELLED').optional(),
  cancelReason: z.string().optional(),
});
export type UpdateLessonBody = z.infer<typeof UpdateLessonBodySchema>;

// ---------- Роуты ----------

export const groupsContract = c.router(
  {
    getStudentCalendar: {
      method: 'GET',
      path: '/student/calendar',
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Календарь ученика за период (с его посещаемостью)',
      metadata: userRoute('student:calendar.view'),
    },
    getParentChildCalendar: {
      method: 'GET',
      path: '/parent/children/:studentId/calendar',
      pathParams: z.object({ studentId: IdSchema }),
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Календарь ребёнка за период',
      metadata: userRoute('parent:child.calendar.view'),
    },
    listGroupLessons: {
      method: 'GET',
      path: '/teacher/groups/:groupId/lessons',
      pathParams: z.object({ groupId: IdSchema }),
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Занятия группы за период',
      metadata: userRoute('teacher:groups.view'),
    },
    createLesson: {
      method: 'POST',
      path: '/teacher/groups/:groupId/lessons',
      pathParams: z.object({ groupId: IdSchema }),
      body: CreateLessonBodySchema,
      responses: { 200: LessonDtoSchema },
      summary: 'Добавить разовое занятие в группу',
      metadata: userRoute('teacher:lessons.manage'),
    },
    updateLesson: {
      method: 'PATCH',
      path: '/teacher/lessons/:lessonId',
      pathParams: z.object({ lessonId: IdSchema }),
      body: UpdateLessonBodySchema,
      responses: { 200: LessonDtoSchema },
      summary: 'Изменить тему/кабинет занятия или отменить его',
      metadata: userRoute('teacher:lessons.manage'),
    },
  },
  contractRouterOptions,
);
