import { z } from 'zod';

/** uuid (v7 в БД). */
export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;

/**
 * true — строка — абсолютная ссылка со схемой http: или https: и непустым хостом. Проверяется
 * префикс сырой строки (без trim): так `javascript:`/`data:` и ссылки с мусором впереди не проходят.
 */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s/?#]+/i.test(value);
}

/** Абсолютный URL только со схемой http/https (без `javascript:`, `data:` и т.п.). */
export const HttpUrlSchema = z
  .string()
  .url()
  .refine(isHttpUrl, { message: 'Ожидается ссылка http(s)' });

/** ISO 8601 с временем, UTC: `2026-09-21T10:00:00.000Z`. */
export const DateTimeSchema = z.string().datetime({ offset: true });
/** Дата без времени: `2026-09-21`. */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD');
/** Время суток: `15:30`. */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ожидается HH:mm');

export const MoneySchema = z.object({
  amountKopecks: z.number().int().nonnegative(),
  currency: z.literal('RUB'),
});
export type Money = z.infer<typeof MoneySchema>;

export const PeriodSchema = z.object({ from: DateOnlySchema, to: DateOnlySchema });
export type Period = z.infer<typeof PeriodSchema>;

/** Query-параметры периода; по умолчанию сервер берёт последние 30 дней. */
export const PeriodQuerySchema = z.object({
  from: DateOnlySchema.optional(),
  to: DateOnlySchema.optional(),
});
export type PeriodQuery = z.infer<typeof PeriodQuerySchema>;

/** 0..1 или null, если данных для расчёта нет. */
export const RateSchema = z.number().min(0).max(1).nullable();
/** 0..100 */
export const PercentSchema = z.number().int().min(0).max(100);
