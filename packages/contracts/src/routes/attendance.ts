/**
 * Посещаемость занятий. Владелец — B3.
 * docs/05-api-contracts.md §5.3 `attendance.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateTimeSchema, IdSchema } from '../common';
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

// ---------- Отметка по QR-коду (docs/07 F6a) ----------

/**
 * Сколько секунд действует код занятия. Экран преподавателя берёт новый код каждые
 * `ATTENDANCE_QR_REFRESH_SEC`, так что снимок QR, пересланный отсутствующему, быстро протухает;
 * запас — на открытие сканера и медленную сеть у ученика.
 */
export const ATTENDANCE_QR_TTL_SEC = 90;
/** Как часто экран преподавателя обновляет QR-код, секунд. */
export const ATTENDANCE_QR_REFRESH_SEC = 30;

/**
 * Полезная нагрузка диплинка мини-приложения MAX для отметки:
 * `https://max.ru/<бот>?startapp=checkin_<код>`. Код — base64url, влезает в `startapp` без
 * кодирования (латиница, цифры, `_`, `-`).
 */
export const ATTENDANCE_CHECK_IN_START_PARAM_PREFIX = 'checkin_';

/** Код занятия: base64url без `=`. Короче 16 символов сервер не выдаёт. */
const CHECK_IN_CODE_RE = /^[A-Za-z0-9_-]{16,256}$/;

/** `startapp` диплинка MAX для отметки с этим кодом. */
export function attendanceCheckInStartParam(code: string): string {
  return `${ATTENDANCE_CHECK_IN_START_PARAM_PREFIX}${code}`;
}

/** Код занятия из `startapp` диплинка MAX; null — это не отметка или мусор. */
export function parseAttendanceCheckInStartParam(
  startParam: string | null | undefined,
): string | null {
  if (!startParam?.startsWith(ATTENDANCE_CHECK_IN_START_PARAM_PREFIX)) return null;
  const code = startParam.slice(ATTENDANCE_CHECK_IN_START_PARAM_PREFIX.length);
  return CHECK_IN_CODE_RE.test(code) ? code : null;
}

/**
 * Код занятия из строки, которую вернул сканер (или вставил ученик): диплинк
 * `https://max.ru/<бот>?startapp=checkin_<код>`, веб-адрес `<WEB_URL>/check-in/<код>` или
 * голая полезная нагрузка `checkin_<код>`. null — это не QR-код занятия.
 */
export function parseAttendanceQrValue(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const direct = parseAttendanceCheckInStartParam(raw);
  if (direct) return direct;
  // Разбор без `URL`: пакет собирается без DOM- и Node-типов.
  if (!/^https?:\/\/[^/?#\s]+/i.test(raw)) return null;
  const startParam = /[?&]startapp=([^&#]*)/.exec(raw)?.[1];
  if (startParam !== undefined) return parseAttendanceCheckInStartParam(safeDecode(startParam));
  const code = /^https?:\/\/[^/?#]+(?:\/[^?#]*)?\/check-in\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(
    raw,
  )?.[1];
  return code && CHECK_IN_CODE_RE.test(code) ? code : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * QR-код занятия для экрана преподавателя. В QR зашит `url`: с именем бота (`MAX_BOT_NAME`) —
 * диплинк мини-приложения (обычная камера телефона тоже откроет отметку), иначе веб-адрес
 * `${WEB_URL}/check-in/<код>`. Встроенный сканер MAX внутри приложения понимает оба вида.
 */
export const AttendanceQrSchema = z.object({
  lessonId: IdSchema,
  code: z.string().min(16),
  url: z.string().url(),
  expiresAt: DateTimeSchema,
});
export type AttendanceQr = z.infer<typeof AttendanceQrSchema>;

export const CheckInBodySchema = z.object({
  code: z.string().trim().min(1).max(512),
});
export type CheckInBody = z.infer<typeof CheckInBodySchema>;

/**
 * Почему отметка не прошла (`details.reason` у ответа 422): код не наш или подделан, код
 * протух (сканировали старый снимок), занятие отменено, ученика нет в группе занятия.
 */
export const CHECK_IN_FAILURE_REASONS = [
  'CODE_INVALID',
  'CODE_EXPIRED',
  'LESSON_CANCELLED',
  'NOT_ENROLLED',
] as const;
export const CheckInFailureReasonSchema = z.enum(CHECK_IN_FAILURE_REASONS);
export type CheckInFailureReason = z.infer<typeof CheckInFailureReasonSchema>;

/** Итог отметки: занятие с отметкой ученика; `alreadyMarked` — отметка уже стояла, ничего не менялось. */
export const CheckInResultSchema = z.object({
  lesson: LessonDtoSchema,
  status: AttendanceStatusSchema,
  alreadyMarked: z.boolean(),
});
export type CheckInResult = z.infer<typeof CheckInResultSchema>;

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
    getAttendanceQr: {
      method: 'GET',
      path: '/teacher/lessons/:lessonId/attendance/qr',
      pathParams: z.object({ lessonId: IdSchema }),
      responses: { 200: AttendanceQrSchema },
      summary:
        'Свежий QR-код занятия для самоотметки учеников (живёт ATTENDANCE_QR_TTL_SEC; только в день занятия, отменённое — 422)',
      metadata: userRoute('teacher:attendance.mark'),
    },
    checkIn: {
      method: 'POST',
      path: '/student/attendance/check-in',
      body: CheckInBodySchema,
      responses: { 200: CheckInResultSchema },
      summary:
        'Ученик отмечается по коду из QR (встроенный сканер MAX): PRESENT, занятие → DONE; повтор идемпотентен; 422 с details.reason',
      metadata: userRoute('student:attendance.check-in'),
    },
  },
  contractRouterOptions,
);
