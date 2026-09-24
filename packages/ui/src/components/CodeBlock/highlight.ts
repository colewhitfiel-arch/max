/**
 * Крошечная подсветка синтаксиса без зависимостей: лексер на одном регулярном выражении
 * по языку + классификация идентификаторов. Точность — «как в редакторе на глаз»
 * (цвета VS Code Dark+), не полноценный парсер.
 */

export type CodeLanguage = 'python' | 'cpp' | 'javascript' | 'text';

/** Вид токена → цвет в CodeBlock.css. `plain` — без подсветки. */
export type CodeTokenType =
  'plain' | 'keyword' | 'control' | 'function' | 'identifier' | 'number' | 'string' | 'comment';

export interface CodeToken {
  type: CodeTokenType;
  text: string;
}

interface Grammar {
  /** Объявления, типы и константы языка (синие). */
  keywords: ReadonlySet<string>;
  /** Управление потоком и импорт (фиолетовые). */
  control: ReadonlySet<string>;
  comment: string;
  string: string;
  /** Директивы препроцессора C++ (`#include`) — цвет управляющих. */
  directive?: string;
  /**
   * `#include <Servo.h>` целиком: директива, пробелы и `<…>` (строка, как в редакторе).
   * Одной альтернативой, а не lookbehind: его нет в Safari/iOS до 16.4.
   */
  include?: string;
}

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

/* Строки допускают незакрытую кавычку до конца строки/кода — подсветка не «ломается» при наборе. */
const DOUBLE_QUOTED = String.raw`"(?:\\.|[^"\\\n])*"?`;
const SINGLE_QUOTED = String.raw`'(?:\\.|[^'\\\n])*'?`;
const C_COMMENT = String.raw`\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`;
/* Шаблонная строка JS. Обычный литерал: в String.raw обратную кавычку не заэкранировать
 * без лишнего «\», а флаг `u` запрещает такие экранирования. */
const TEMPLATE = '`(?:\\\\[\\s\\S]|[^`\\\\])*`?';

const GRAMMARS: Record<Exclude<CodeLanguage, 'text'>, Grammar> = {
  python: {
    keywords: words(`def class lambda None True False and or not in is global nonlocal self`),
    control: words(
      `if elif else for while break continue return pass try except finally raise with as
       import from yield await async assert del`,
    ),
    comment: String.raw`#[^\n]*`,
    string: String.raw`[rRbBuUfF]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|${DOUBLE_QUOTED}|${SINGLE_QUOTED})`,
  },
  cpp: {
    keywords: words(
      `int float double char bool void long short unsigned signed const constexpr static
       struct class enum union auto true false nullptr NULL new delete this public private
       protected virtual override template typename namespace using sizeof inline volatile
       extern uint8_t uint16_t uint32_t int8_t int16_t int32_t size_t String byte boolean`,
    ),
    control: words(
      `if else for while do switch case default break continue return goto try catch throw`,
    ),
    comment: C_COMMENT,
    string: `${DOUBLE_QUOTED}|${SINGLE_QUOTED}`,
    include: String.raw`(?<includeDirective>#[ \t]*include)(?<includeSpace>[ \t]*)(?<includePath><[^>\n]*>)`,
    directive: String.raw`#[ \t]*[A-Za-z_]\w*`,
  },
  javascript: {
    keywords: words(
      `const let var function class new this super true false null undefined typeof
       instanceof in of void delete async extends static get set`,
    ),
    control: words(
      `if else for while do switch case default break continue return try catch finally
       throw import export from await yield`,
    ),
    comment: C_COMMENT,
    string: `${DOUBLE_QUOTED}|${SINGLE_QUOTED}|${TEMPLATE}`,
  },
};

const NUMBER = String.raw`0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_']*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[uUlLfFnj]*`;
const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;

const lexers = new Map<CodeLanguage, RegExp>();

function lexer(language: Exclude<CodeLanguage, 'text'>): RegExp {
  const cached = lexers.get(language);
  if (cached) return cached;
  const grammar = GRAMMARS[language];
  const parts = [
    `(?<comment>${grammar.comment})`,
    `(?<string>${grammar.string})`,
    grammar.include ? `(?<include>${grammar.include})` : null,
    grammar.directive ? `(?<directive>${grammar.directive})` : null,
    `(?<number>${NUMBER})`,
    `(?<identifier>${IDENTIFIER})`,
  ].filter(Boolean);
  const pattern = new RegExp(parts.join('|'), 'gu');
  lexers.set(language, pattern);
  return pattern;
}

/** Следующий значимый символ после позиции (пробелы и табы пропускаются). */
function nextSignificant(code: string, from: number): string | undefined {
  let index = from;
  while (code[index] === ' ' || code[index] === '\t') index += 1;
  return code[index];
}

function classifyIdentifier(
  word: string,
  grammar: Grammar,
  code: string,
  end: number,
): CodeTokenType {
  if (grammar.control.has(word)) return 'control';
  if (grammar.keywords.has(word)) return 'keyword';
  // Пропуск в задании («__________()») — не подсвечиваем, это место для ответа.
  if (/^_+$/.test(word)) return 'plain';
  if (nextSignificant(code, end) === '(') return 'function';
  return 'identifier';
}

/** Разбивает код на токены. Соседние неподсвеченные куски склеиваются. */
export function tokenizeCode(code: string, language: CodeLanguage = 'text'): CodeToken[] {
  if (language === 'text' || !(language in GRAMMARS)) return [{ type: 'plain', text: code }];
  const grammar = GRAMMARS[language];
  const pattern = lexer(language);
  const tokens: CodeToken[] = [];
  const push = (type: CodeTokenType, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (type === 'plain' && last?.type === 'plain') last.text += text;
    else tokens.push({ type, text });
  };

  let cursor = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    const text = match[0];
    if (!text) {
      pattern.lastIndex += 1;
      continue;
    }
    push('plain', code.slice(cursor, match.index));
    const groups = match.groups ?? {};
    const end = match.index + text.length;
    if (groups.comment != null) push('comment', text);
    else if (groups.string != null) push('string', text);
    else if (groups.include != null) {
      push('control', groups.includeDirective ?? '');
      push('plain', groups.includeSpace ?? '');
      push('string', groups.includePath ?? '');
    } else if (groups.directive != null) push('control', text);
    else if (groups.number != null) push('number', text);
    else push(classifyIdentifier(text, grammar, code, end), text);
    cursor = end;
  }
  push('plain', code.slice(cursor));
  return tokens;
}
