/**
 * Разбор безопасного подмножества Markdown в дерево без HTML: заголовки `#`…`###`, абзацы,
 * `**жирный**`, `*курсив*`, `` `код` ``, блоки кода ```` ``` ````, маркированные и нумерованные
 * списки (с вложенностью), цитаты `>`, линия `---`, ссылки `[текст](https://…)` и `<https://…>`
 * (без ссылок внутри подписи ссылки).
 * Дерево рендерится React-элементами (текст экранирует React): сырой HTML остаётся текстом,
 * ссылки — только http(s), картинки — только подписью (`alt`). Без зависимостей.
 */

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'em'; children: MarkdownInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: MarkdownInline[] }
  | { type: 'break' };

export interface MarkdownListItem {
  children: MarkdownInline[];
  /** Вложенные списки (пункты с отступом под этим пунктом). */
  lists: MarkdownListBlock[];
}

export interface MarkdownListBlock {
  type: 'list';
  ordered: boolean;
  /** Номер первого пункта нумерованного списка. */
  start: number;
  items: MarkdownListItem[];
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'quote'; children: MarkdownBlock[] }
  | { type: 'rule' }
  | MarkdownListBlock;

/** Глубина вложенности цитат, списков и выделений: глубже — текстом (защита стека). */
const MAX_DEPTH = 8;
/** Длиннее подпись и адрес ссылки не ищутся: иначе текст с тысячами «[» или «(» разбирается квадратично. */
const MAX_LINK_LABEL = 1000;
const MAX_LINK_URL = 2048;
/**
 * Сколько символов разбор ссылок может просмотреть в одном абзаце: каждая «[» смотрит вперёд до
 * MAX_LINK_LABEL + MAX_LINK_URL, и строка-ловушка из тысяч «[](» иначе разбиралась бы секундами.
 * Бюджет кончился — дальше «[» остаются текстом. 2 млн — ловушка в 100 тыс. символов укладывается
 * в десятки миллисекунд, а сотни непарных «[» в обычном тексте ссылки после себя не выключают.
 */
const LINK_SCAN_BUDGET = 2_000_000;

interface ScanBudget {
  left: number;
}

// Регулярки блоков — без вложенных квантификаторов с перекрытием: текст ИИ и преподавателя не
// ограничен по длине, и строка в сотню тысяч символов не должна разбираться квадратично.
// Остаток строки ограждения и заголовка разбирается вручную (fenceOf, headingOf).
const FENCE = /^(\s*)(`{3,}|~{3,})([\s\S]*)$/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})[ \t]*$/;
const HEADING_OPEN = /^ {0,3}(#{1,6})(?=[ \t]|$)/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^([ \t]*)([-*+]|(\d{1,9})[.)])[ \t]+(\S.*)$/;
const ESCAPABLE = '\\`*_{}[]()#+-.!<>~|"\'';

/** Ссылка только http(s): `javascript:`, `data:`, относительные и прочие — `null` (выводится текстом). */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const isBlank = (line: string) => line.trim() === '';

function indentOf(prefix: string): number {
  let width = 0;
  for (const ch of prefix) width = ch === '\t' ? width + 4 - (width % 4) : width + 1;
  return width;
}

function stripIndent(line: string, width: number): string {
  let i = 0;
  while (i < width && line[i] === ' ') i += 1;
  return line.slice(i);
}

interface ItemMatch {
  indent: number;
  ordered: boolean;
  number: number;
  text: string;
}

function matchItem(line: string): ItemMatch | null {
  if (RULE.test(line)) return null; // «* * *» — линия, а не пункт
  const m = ITEM.exec(line);
  if (!m) return null;
  return {
    indent: indentOf(m[1] ?? ''),
    ordered: m[3] !== undefined,
    number: m[3] !== undefined ? Number(m[3]) : 1,
    text: m[4] ?? '',
  };
}

interface FenceMatch {
  /** Отступ открывающей строки: снимается со строк тела. */
  indent: number;
  marker: string;
  language: string;
}

/** Открывающая строка блока кода: ``` или ~~~ (от трёх) и язык. После ``` в строке нет «`». */
function fenceOf(line: string): FenceMatch | null {
  const m = FENCE.exec(line);
  if (!m) return null;
  const marker = m[2]!;
  const info = m[3]!.trim();
  if (marker[0] === '`' && info.includes('`')) return null;
  return { indent: m[1]!.length, marker, language: /^\S*/.exec(info)![0].toLowerCase() };
}

const isSpaceOrTab = (ch: string | undefined) => ch === ' ' || ch === '\t';

/** Заголовок `#`…`######`: уровень и текст без закрывающей серии `#` и пробелов по краям. */
function headingOf(line: string): { level: number; text: string } | null {
  const m = HEADING_OPEN.exec(line);
  if (!m) return null;
  const start = m[0].length;
  let end = line.length;
  while (end > start && isSpaceOrTab(line[end - 1])) end -= 1;
  let hashes = end;
  while (hashes > start && line[hashes - 1] === '#') hashes -= 1;
  // Закрывающая серия «#» отделена пробелом, иначе это часть текста («C#»).
  if (hashes < end && isSpaceOrTab(line[hashes - 1])) end = hashes;
  return { level: m[1]!.length, text: line.slice(start, end).trim() };
}

/** Строка начинает другой блок (прерывает абзац или пункт списка). */
function startsBlock(line: string): boolean {
  return fenceOf(line) !== null || HEADING_OPEN.test(line) || RULE.test(line) || QUOTE.test(line);
}

function parseFence(lines: string[], start: number, { indent, marker, language }: FenceMatch) {
  const body: string[] = [];
  let i = start + 1;
  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const close = FENCE_CLOSE.exec(line);
    if (close && close[1]![0] === marker[0] && close[1]!.length >= marker.length) {
      i += 1;
      break;
    }
    body.push(stripIndent(line, indent));
  }
  const block: MarkdownBlock = { type: 'code', language, text: body.join('\n') };
  return { block, next: i };
}

function parseList(
  lines: string[],
  start: number,
  first: ItemMatch,
  depth: number,
): { block: MarkdownListBlock; next: number } {
  const block: MarkdownListBlock = {
    type: 'list',
    ordered: first.ordered,
    start: first.number,
    items: [],
  };
  const texts: string[][] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      // Пустые строки между пунктами: список продолжается, если дальше пункт этого же
      // списка (или вложенный); иначе — конец списка.
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j] ?? '')) j += 1;
      const next = j < lines.length ? matchItem(lines[j] ?? '') : null;
      const continues =
        next !== null &&
        next.indent >= first.indent &&
        (next.indent > first.indent + 1 || next.ordered === first.ordered);
      if (!continues) break;
      i = j;
      continue;
    }
    const item = matchItem(line);
    if (item) {
      if (item.indent < first.indent) break; // пункт внешнего списка
      const nested = item.indent > first.indent + 1 && block.items.length > 0;
      if (nested && depth < MAX_DEPTH) {
        const result = parseList(lines, i, item, depth + 1);
        block.items[block.items.length - 1]!.lists.push(result.block);
        i = result.next;
        continue;
      }
      if (!nested && item.ordered !== first.ordered) break; // другой вид — новый список
      block.items.push({ children: [], lists: [] });
      texts.push([item.text]);
      i += 1;
      continue;
    }
    if (startsBlock(line)) break;
    // Строка с отступом меньше вложенного списка — продолжение пункта внешнего.
    if (depth > 0 && indentOf(/^[ \t]*/.exec(line)?.[0] ?? '') < first.indent) break;
    texts[texts.length - 1]?.push(line.trim());
    i += 1;
  }
  block.items.forEach((item, index) => {
    item.children = parseInline((texts[index] ?? []).join('\n'));
  });
  return { block, next: i };
}

function parseBlocks(lines: string[], depth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const fence = fenceOf(line);
    if (fence) {
      const result = parseFence(lines, i, fence);
      blocks.push(result.block);
      i = result.next;
      continue;
    }
    const heading = headingOf(line);
    if (heading) {
      const { text } = heading;
      const level = Math.min(heading.level, 3) as 1 | 2 | 3;
      if (text) blocks.push({ type: 'heading', level, children: parseInline(text) });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }
    if (QUOTE.test(line) && depth < MAX_DEPTH) {
      const inner: string[] = [];
      for (
        let m = QUOTE.exec(lines[i] ?? '');
        m && i < lines.length;
        m = QUOTE.exec(lines[i] ?? '')
      ) {
        inner.push(m[1] ?? '');
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner, depth + 1) });
      continue;
    }
    const item = matchItem(line);
    if (item) {
      const result = parseList(lines, i, item, 0);
      blocks.push(result.block);
      i = result.next;
      continue;
    }
    // Абзац: строки до пустой или до начала другого блока; переносы внутри сохраняются.
    const paragraph: string[] = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (isBlank(next) || startsBlock(next) || matchItem(next)) break;
      paragraph.push(next.trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}

/** Разбирает Markdown в блоки. Переносы строк внутри абзаца сохраняются (`break`). */
export function parseMarkdown(source: string): MarkdownBlock[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'), 0);
}

// ---------- Строчная разметка ----------

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function runOf(text: string, from: number, ch: string): number {
  let end = from;
  while (text[end] === ch) end += 1;
  return end - from;
}

/** Закрывающая серия из ровно `run` обратных кавычек. */
function findCodeClose(text: string, from: number, run: number): number {
  let j = text.indexOf('`', from);
  while (j !== -1) {
    const length = runOf(text, j, '`');
    if (length === run) return j;
    j = text.indexOf('`', j + length);
  }
  return -1;
}

function codeText(raw: string): string {
  const text = raw.replace(/\n/g, ' ');
  return text.length >= 2 && text.startsWith(' ') && text.endsWith(' ') && text.trim()
    ? text.slice(1, -1)
    : text;
}

/**
 * Закрывающий `*`/`**` (`_`/`__`) после `from`: пропускает экранирование и код, у `_` — не
 * внутри слова. Для `***` берёт последние символы серии (`**a *b***` → жирный с курсивом).
 * `failed` — с какой позиции закрывающего уже точно нет (без квадратичного перебора).
 */
function findCloser(
  text: string,
  from: number,
  ch: string,
  size: number,
  failed: Map<string, number>,
): number {
  const key = ch + size;
  const known = failed.get(key);
  if (known !== undefined && from >= known) return -1;
  let j = from;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '`') {
      const run = runOf(text, j, '`');
      const close = findCodeClose(text, j + run, run);
      j = close >= 0 ? close + run : j + run;
      continue;
    }
    if (c === ch) {
      const run = runOf(text, j, ch);
      const canClose =
        j > from && !isSpace(text[j - 1]) && !(ch === '_' && isWordChar(text[j + run]));
      if (canClose) {
        if (run === size) return j;
        if (run > size && (size === 2 || run >= 3)) return j + run - size;
      }
      j += run;
      continue;
    }
    j += 1;
  }
  failed.set(key, Math.min(known ?? Number.POSITIVE_INFINITY, from));
  return -1;
}

interface LinkMatch {
  label: string;
  url: string;
  end: number;
}

/** `[подпись](адрес "заголовок")` с `[` в позиции `start`. */
function parseLink(text: string, start: number, budget: ScanBudget): LinkMatch | null {
  if (budget.left <= 0) return null;
  let depth = 0;
  let j = start;
  for (; j < text.length && j - start <= MAX_LINK_LABEL; j += 1) {
    const c = text[j];
    if (c === '\\') {
      j += 1;
    } else if (c === '`') {
      const run = runOf(text, j, '`');
      const close = findCodeClose(text, j + run, run);
      j = (close >= 0 ? close + run : j + run) - 1;
    } else if (c === '[') {
      depth += 1;
    } else if (c === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  budget.left -= j - start + 1;
  if (text[j] !== ']' || text[j + 1] !== '(') return null;
  const label = text.slice(start + 1, j);
  let k = j + 2;
  while (text[k] === ' ' || text[k] === '\t') k += 1;
  let url: string;
  if (text[k] === '<') {
    const window = text.slice(k, k + MAX_LINK_URL);
    const end = window.indexOf('>');
    budget.left -= end < 0 ? window.length : end + 1;
    if (end < 0 || window.slice(0, end).includes('\n')) return null;
    const close = k + end;
    url = text.slice(k + 1, close);
    k = close + 1;
  } else {
    const begin = k;
    let parens = 0;
    for (; k < text.length && k - begin <= MAX_LINK_URL; k += 1) {
      const c = text[k]!;
      if (c === '\\') {
        k += 1;
        continue;
      }
      if (/\s/.test(c)) break;
      if (c === '(') parens += 1;
      else if (c === ')') {
        if (parens === 0) break;
        parens -= 1;
      }
    }
    budget.left -= k - begin + 1;
    url = text.slice(begin, k);
  }
  while (text[k] === ' ' || text[k] === '\t') k += 1;
  const quote = text[k];
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, k + 1);
    if (close < 0) return null;
    k = close + 1;
    while (text[k] === ' ' || text[k] === '\t') k += 1;
  }
  if (text[k] !== ')') return null;
  return { label, url: url.replace(/\\(.)/g, '$1'), end: k + 1 };
}

function pushText(out: MarkdownInline[], text: string) {
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

function pushAll(out: MarkdownInline[], nodes: MarkdownInline[]) {
  for (const node of nodes) {
    if (node.type === 'text') pushText(out, node.text);
    else out.push(node);
  }
}

/**
 * Строчная разметка абзаца или пункта: выделение, код, ссылки, переносы строк. `inLink` — текст
 * внутри подписи ссылки: ссылки в нём остаются текстом (`<a>` в `<a>` недопустим, а нажатие на
 * вложенную открыло бы обе).
 */
export function parseInline(
  text: string,
  depth = 0,
  inLink = false,
  budget: ScanBudget = { left: LINK_SCAN_BUDGET },
): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  const failed = new Map<string, number>();
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === '\\' && next !== undefined && ESCAPABLE.includes(next)) {
      pushText(out, next);
      i += 2;
      continue;
    }
    if (ch === '\n') {
      out.push({ type: 'break' });
      i += 1;
      continue;
    }
    if (ch === '`') {
      const run = runOf(text, i, '`');
      const close = findCodeClose(text, i + run, run);
      if (close >= 0) {
        out.push({ type: 'code', text: codeText(text.slice(i + run, close)) });
        i = close + run;
      } else {
        pushText(out, text.slice(i, i + run));
        i += run;
      }
      continue;
    }
    if (ch === '<' && !inLink) {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(text.slice(i, i + 2048));
      const href = auto ? safeHref(auto[1]!) : null;
      if (auto && href) {
        out.push({ type: 'link', href, children: [{ type: 'text', text: auto[1]! }] });
        i += auto[0].length;
        continue;
      }
    }
    const image = ch === '!' && next === '[';
    if (image || (ch === '[' && !inLink)) {
      const link = parseLink(text, image ? i + 1 : i, budget);
      if (link) {
        const href = image ? null : safeHref(link.url);
        const children =
          depth < MAX_DEPTH
            ? parseInline(link.label, depth + 1, inLink || href !== null, budget)
            : [{ type: 'text' as const, text: link.label }];
        // Картинка — только подписью (без внешних загрузок); небезопасная ссылка — текстом.
        if (href) out.push({ type: 'link', href, children });
        else pushAll(out, children);
        i = link.end;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && depth < MAX_DEPTH) {
      const run = runOf(text, i, ch);
      const canOpen = !isSpace(text[i + run]) && !(ch === '_' && isWordChar(text[i - 1]));
      if (canOpen) {
        const size = run >= 2 ? 2 : 1;
        const close = findCloser(text, i + size, ch, size, failed);
        if (close > i + size) {
          const children = parseInline(text.slice(i + size, close), depth + 1, inLink, budget);
          out.push(size === 2 ? { type: 'strong', children } : { type: 'em', children });
          i = close + size;
          continue;
        }
      }
      pushText(out, text.slice(i, i + run));
      i += run;
      continue;
    }
    pushText(out, ch);
    i += 1;
  }
  return out;
}

/** Текст без разметки (превью, подписи): блоки через пробел, переносы — пробелом. */
export function markdownToText(source: string): string {
  const inline = (nodes: MarkdownInline[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case 'text':
          case 'code':
            return node.text;
          case 'break':
            return ' ';
          default:
            return inline(node.children);
        }
      })
      .join('');
  const block = (node: MarkdownBlock): string => {
    switch (node.type) {
      case 'heading':
      case 'paragraph':
        return inline(node.children);
      case 'code':
        return node.text;
      case 'quote':
        return node.children.map(block).join(' ');
      case 'rule':
        return '';
      case 'list':
        return node.items
          .map((item) => [inline(item.children), ...item.lists.map(block)].join(' '))
          .join(' ');
    }
  };
  return parseMarkdown(source).map(block).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
