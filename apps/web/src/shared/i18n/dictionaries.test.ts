/**
 * Словари ru и en должны описывать один и тот же набор ключей: иначе на одном из языков
 * пользователь увидит сырой ключ или fallback на ru. Формы множественного числа
 * (`_one`/`_few`/`_many`/`_other`) у языков разные — сравниваем базовые ключи.
 */
import { describe, expect, it } from 'vitest';
import { NAMESPACES, SUPPORTED_LANGUAGES } from './index';

const dictionaries = import.meta.glob<Record<string, unknown>>('./*.*.json', {
  eager: true,
  import: 'default',
});

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function baseKeys(dict: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? baseKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key.replace(PLURAL_SUFFIX, '')}`],
  );
}

function keysOf(ns: string, lng: string): string[] {
  const dict = dictionaries[`./${ns}.${lng}.json`];
  if (!dict) throw new Error(`Нет словаря ${ns}.${lng}.json`);
  return [...new Set(baseKeys(dict))].sort();
}

describe('i18n: словари ru и en согласованы', () => {
  it.each([...NAMESPACES])('%s: одинаковый набор ключей на всех языках', (ns) => {
    const [reference, ...others] = SUPPORTED_LANGUAGES;
    const expected = keysOf(ns, reference);
    for (const lng of others) expect(keysOf(ns, lng)).toEqual(expected);
  });

  it('каждый файл словаря объявлен в NAMESPACES', () => {
    const files = Object.keys(dictionaries).map((path) => /^\.\/([a-z-]+)\./i.exec(path)?.[1]);
    expect([...new Set(files)].sort()).toEqual([...NAMESPACES].sort());
  });
});
