import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT, type Paginated } from '@edu/contracts';
import type { z } from 'zod';
import { Errors } from '../errors/app-error';

/** Курсор — base64url от JSON с ключами сортировки. */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Разбирает курсор. `schema` проверяет форму: валидный base64-JSON без нужных ключей иначе
 * дошёл бы до Prisma (Invalid Date → 500). Без схемы — только разбор JSON.
 */
export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string | undefined,
  schema?: z.ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  if (!cursor) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw Errors.validation('Некорректный cursor');
  }
  if (!schema) return value as T;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.validation('Некорректный cursor');
  return parsed.data;
}

export function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? PAGINATION_DEFAULT_LIMIT, 1), PAGINATION_MAX_LIMIT);
}

/** Берёт limit+1 строк, отдаёт limit и курсор, если есть ещё. */
export function toPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (last: T) => Record<string, unknown>,
): Paginated<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, ...(hasMore && last ? { nextCursor: encodeCursor(cursorOf(last)) } : {}) };
}
