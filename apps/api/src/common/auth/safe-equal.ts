import { timingSafeEqual } from 'node:crypto';

/**
 * Сравнение секретов за постоянное время. Длины сверяются у байтовых буферов, а не у строк:
 * не-ASCII символ даёт ту же длину строки, но другой размер буфера, и timingSafeEqual бросил бы
 * RangeError (500 вместо 401).
 */
export function safeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
