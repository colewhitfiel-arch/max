import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT, type Paginated } from '@edu/contracts';
import { Errors } from '../errors/app-error';

/** Курсор — base64url от JSON с ключами сортировки. */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string | undefined,
): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw Errors.validation('Некорректный cursor');
  }
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
