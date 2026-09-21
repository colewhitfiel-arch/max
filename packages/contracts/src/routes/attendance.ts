/**
 * Посещаемость занятий. Владелец — B3.
 * docs/05-api-contracts.md §5.3 `attendance.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema } from '../common';
import { AttendanceStatusSchema } from '../enums';
import { LessonDtoSchema, StudentBriefSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

/** Строка листа: status null — ещё не отмечен. */
export const AttendanceRowSchema = z.object({
  student: StudentBriefSchema,
  status: AttendanceStatusSchema.nullable(),
  comment: z.string().nullable(),
});
export type AttendanceRow = z.infer<typeof AttendanceRowSchema>;

export const AttendanceSheetSchema = z.object({
  lesson: LessonDtoSchema,
  rows: z.array(AttendanceRowSchema),
});
export type AttendanceSheet = z.infer<typeof AttendanceSheetSchema>;

// ---------- Тела запросов ----------

export const MarkAttendanceRowSchema = z.object({
  studentId: IdSchema,
  status: AttendanceStatusSchema,
  comment: z.string().optional(),
});
export type MarkAttendanceRow = z.infer<typeof MarkAttendanceRowSchema>;

/** Upsert всех строк; занятие переводится в DONE. Повторный PUT идемпотентен. */
export const MarkAttendanceBodySchema = z.object({
  rows: z.array(MarkAttendanceRowSchema),
});
export type MarkAttendanceBody = z.infer<typeof MarkAttendanceBodySchema>;

// ---------- Роуты ----------

export const attendanceContract = c.router(
  {
    getAttendanceSheet: {
      method: 'GET',
      path: '/teacher/lessons/:lessonId/attendance',
      pathParams: z.object({ lessonId: IdSchema }),
      responses: { 200: AttendanceSheetSchema },
      summary: 'Лист посещаемости занятия',
      metadata: userRoute('teacher:attendance.mark'),
    },
    markAttendance: {
      method: 'PUT',
      path: '/teacher/lessons/:lessonId/attendance',
      pathParams: z.object({ lessonId: IdSchema }),
      body: MarkAttendanceBodySchema,
      responses: { 200: AttendanceSheetSchema },
      summary: 'Отметить посещаемость (upsert всех строк, занятие → DONE)',
      metadata: userRoute('teacher:attendance.mark'),
    },
  },
  contractRouterOptions,
);
