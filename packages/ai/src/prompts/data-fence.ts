/**
 * Защита промптов от текста пользователей: имена — одной строкой, пользовательские данные —
 * в ограждённом блоке, который модель читает как сведения, а не как указания.
 */

/** Границы блока данных: всё между ними — сведения, а не указания модели. */
export const DATA_OPEN = '<<<ДАННЫЕ';
export const DATA_CLOSE = 'ДАННЫЕ>>>';

const MAX_NAME_LENGTH = 40;

/** Одна строка без переводов и повторных пробелов, не длиннее `max` символов. */
export function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** Имя одной строкой и не длиннее 40 символов: перевод строки в имени не ломает формат промпта. */
export function safeName(name: string, fallback: string): string {
  return oneLine(name, MAX_NAME_LENGTH) || fallback;
}

/** Внутри данных не бывает границы блока: пользователь не «закроет» данные своим текстом. */
export function fenceData(text: string): string {
  return text.replace(/<{3,}|>{3,}/g, '…');
}

/** Блок данных целиком: открывающая граница, очищенный текст, закрывающая граница. */
export function fencedBlock(text: string): string {
  return [DATA_OPEN, fenceData(text), DATA_CLOSE].join('\n');
}
