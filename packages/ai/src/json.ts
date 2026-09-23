import { jsonrepair } from 'jsonrepair';
import type { ZodError, ZodTypeAny, z } from 'zod';
import type { AiProvider } from './provider';
import type { AiChatMessage, AiChatRequest, AiChatResponse } from './types';
import { AiProviderError } from './types';

/**
 * Вырезает JSON из ответа модели:
 * 1) содержимое ```json-блока (или любого ```-блока, начинающегося с `{`/`[`),
 * 2) иначе — первый сбалансированный объект `{…}` или массив `[…]`,
 * 3) иначе — весь текст, если он сам по себе валидный JSON (скаляр).
 * Возвращает `null`, если ничего похожего на JSON нет.
 */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const fenced = extractFromFence(trimmed);
  if (fenced !== null) return fenced;

  const balanced = extractBalanced(trimmed);
  if (balanced !== null) return balanced;

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function extractFromFence(text: string): string | null {
  const fence = /```[a-zA-Z]*[ \t]*\r?\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    const body = (match[1] ?? '').trim();
    if (body.startsWith('{') || body.startsWith('[')) return extractBalanced(body) ?? body;
  }
  return null;
}

/** Ищет первую `{` или `[` и возвращает подстроку до парной закрывающей скобки (строки учитываются). */
function extractBalanced(text: string): string | null {
  const start = findFirstOpener(text);
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
    } else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function findFirstOpener(text: string): number {
  const brace = text.indexOf('{');
  const bracket = text.indexOf('[');
  if (brace < 0) return bracket;
  if (bracket < 0) return brace;
  return Math.min(brace, bracket);
}

/** Область от первой открывающей скобки до последней закрывающей — сырьё для починки. */
function roughJsonRegion(text: string): string | null {
  const start = findFirstOpener(text);
  if (start < 0) return null;
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (end <= start) return null;
  return text.slice(start, end + 1);
}

export type ParseJsonResult<T> =
  | { ok: true; data: T; repaired: boolean }
  | { ok: false; error: string; issues?: ZodError['issues'] };

/**
 * Модель часто закрывает вложенность в обратном порядке: `"…"}]` вместо `"…"]}` (закрыла объект раньше
 * массива). Строчно-осознанный проход меняет такие пары местами; `jsonrepair` этот случай не чинит.
 */
export function fixSwappedClosers(text: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inString) {
      out.push(ch);
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
    } else if (ch === '}' || ch === ']') {
      const expected = stack[stack.length - 1];
      const outer = stack[stack.length - 2];
      if (expected !== undefined && ch !== expected && text[i + 1] === expected && ch === outer) {
        out.push(expected, ch);
        stack.length -= 2;
        i += 1;
        continue;
      }
      stack.pop();
    }
    out.push(ch);
  }
  return out.join('');
}

/**
 * `JSON.parse` с починкой типичных ошибок модели: переставленные закрывающие скобки (`fixSwappedClosers`),
 * потерянная скобка между элементами массива, висящая запятая, одинарные кавычки (`jsonrepair`). Сначала — как есть.
 */
function parseLoose(candidate: string): { value: unknown; repaired: boolean } | { error: string } {
  try {
    return { value: JSON.parse(candidate), repaired: false };
  } catch (error) {
    const reason = describeJsonSyntaxError(error);
    for (const variant of [candidate, fixSwappedClosers(candidate)]) {
      try {
        return { value: JSON.parse(jsonrepair(variant)), repaired: true };
      } catch {
        // пробуем следующий вариант
      }
    }
    return { error: reason };
  }
}

/**
 * Описание `SyntaxError` без фрагмента входа: V8 цитирует разбираемую строку
 * (`Unexpected token 'П', "Привет, во"... is not valid JSON`), а текст ошибки уходит в логи.
 * Остаётся только позиция — её достаточно и для лога, и для подсказки модели при ретрае.
 */
function describeJsonSyntaxError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const position = /at position (\d+)/.exec(message)?.[1];
  if (position !== undefined) return `синтаксическая ошибка JSON (позиция ${position})`;
  if (/unexpected end/i.test(message)) return 'JSON оборван (неожиданный конец)';
  return 'синтаксическая ошибка JSON';
}

/**
 * Человекочитаемое описание ошибок zod — идёт обратно модели при ретрае и в лог `ai.json.invalid`.
 * Хвост `, received '…'` (zod цитирует полученное значение для enum) вырезается: это текст модели.
 */
export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(корень)';
      return `${path}: ${issue.message.replace(/,\s*received\s+'[\s\S]*'$/, '')}`;
    })
    .join('; ');
}

/** Извлекает JSON из текста, парсит и валидирует схемой. Не бросает. */
export function parseJsonResponse<S extends ZodTypeAny>(
  text: string,
  schema: S,
): ParseJsonResult<z.output<S>> {
  // Сбалансированный фрагмент не нашёлся (модель потеряла/добавила скобку) — чиним грубую область
  const candidate = extractJson(text) ?? roughJsonRegion(text);
  if (candidate === null) return { ok: false, error: 'В ответе не найден JSON' };

  const loose = parseLoose(candidate);
  if ('error' in loose) return { ok: false, error: `Невалидный JSON: ${loose.error}` };

  const result = schema.safeParse(loose.value);
  if (!result.success) {
    return {
      ok: false,
      error: `Ответ не соответствует схеме: ${formatZodIssues(result.error)}`,
      issues: result.error.issues,
    };
  }
  return { ok: true, data: result.data as z.output<S>, repaired: loose.repaired };
}

export interface ChatJsonOptions {
  /** Сколько раз переспросить модель при невалидном ответе. По умолчанию 2 (ADR-007). */
  maxRetries?: number;
  /** Текст сообщения с ошибкой валидации, отправляемого модели перед повтором. */
  buildRetryMessage?: (error: string) => string;
  /** Текст повторного запроса, если ответ обрезан по лимиту токенов (`finishReason: 'length'`). */
  buildTruncatedMessage?: () => string;
  /** Вызывается на каждый невалидный ответ (для логов/метрик): номер попытки и текст ошибки схемы. */
  onInvalid?: (info: { attempt: number; error: string }) => void;
  /** Вызывается, когда JSON ответа пришлось чинить (`jsonrepair`), но он прошёл схему. */
  onRepaired?: (info: { attempt: number }) => void;
}

export interface ChatJsonResult<T> {
  data: T;
  response: AiChatResponse;
  /** Сколько вызовов модели потребовалось (1 = с первого раза). */
  attempts: number;
  /** JSON последнего ответа пришлось чинить (`jsonrepair`). */
  repaired: boolean;
}

/** Ошибка для ответа, оборванного по `max_tokens`: такой JSON «чинить» нельзя — данные неполные. */
export const TRUNCATED_JSON_ERROR = 'ответ обрезан по лимиту токенов';

export function defaultTruncatedMessage(): string {
  return (
    'Предыдущий ответ оборвался: не хватило лимита длины. Ответь заново короче, но полностью: ' +
    'меньше разделов, абзацев и блоков, короче формулировки. Верни только валидный JSON без пояснений и без markdown.'
  );
}

export function defaultRetryMessage(error: string): string {
  return (
    `Предыдущий ответ не прошёл проверку: ${error}. ` +
    'Верни только валидный JSON, соответствующий требуемой структуре, без пояснений и без markdown.'
  );
}

/**
 * Запрос к модели с ожиданием структурированного ответа.
 * При невалидном JSON повторяет запрос, добавляя в диалог ответ модели и текст ошибки валидации.
 * Ответ, оборванный по лимиту токенов (`finishReason: 'length'`), принимается, только если он
 * разобрался без починки; иначе — повтор с просьбой ответить короче (обрезанный текст в историю не идёт).
 * После исчерпания попыток бросает `AiProviderError('INVALID_RESPONSE')`.
 */
export async function chatJson<S extends ZodTypeAny>(
  provider: AiProvider,
  req: AiChatRequest,
  schema: S,
  options: ChatJsonOptions = {},
): Promise<ChatJsonResult<z.output<S>>> {
  const maxRetries = options.maxRetries ?? 2;
  const buildRetryMessage = options.buildRetryMessage ?? defaultRetryMessage;
  const buildTruncatedMessage = options.buildTruncatedMessage ?? defaultTruncatedMessage;

  let messages: AiChatMessage[] = req.messages;
  let lastError = 'нет ответа';

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const response = await provider.chat({ ...req, messages, responseFormat: 'json' });
    const parsed = parseJsonResponse(response.content, schema);
    // Обрезанный ответ, который пришлось «дозакрыть», проходит схему, но данные в нём неполные.
    if (response.finishReason === 'length' && (!parsed.ok || parsed.repaired)) {
      lastError = TRUNCATED_JSON_ERROR;
      options.onInvalid?.({ attempt, error: TRUNCATED_JSON_ERROR });
      // При том же max_tokens обрезанный ответ в истории лишь съест контекст — просим короче.
      messages = [...messages, { role: 'user', content: buildTruncatedMessage() }];
      continue;
    }
    if (parsed.ok) {
      if (parsed.repaired) options.onRepaired?.({ attempt });
      return { data: parsed.data, response, attempts: attempt, repaired: parsed.repaired };
    }

    lastError = parsed.error;
    options.onInvalid?.({ attempt, error: parsed.error });
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: buildRetryMessage(parsed.error) },
    ];
  }

  throw new AiProviderError(
    'INVALID_RESPONSE',
    `Модель не вернула валидный JSON за ${maxRetries + 1} попыток: ${lastError}`,
    { retryable: false },
  );
}
