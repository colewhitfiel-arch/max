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

export type ParseJsonResult<T> =
  { ok: true; data: T } | { ok: false; error: string; issues?: ZodError['issues'] };

/** Человекочитаемое описание ошибок zod — идёт обратно модели при ретрае. */
export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(корень)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/** Извлекает JSON из текста, парсит и валидирует схемой. Не бросает. */
export function parseJsonResponse<S extends ZodTypeAny>(
  text: string,
  schema: S,
): ParseJsonResult<z.output<S>> {
  const json = extractJson(text);
  if (json === null) return { ok: false, error: 'В ответе не найден JSON' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Невалидный JSON: ${reason}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Ответ не соответствует схеме: ${formatZodIssues(result.error)}`,
      issues: result.error.issues,
    };
  }
  return { ok: true, data: result.data as z.output<S> };
}

export interface ChatJsonOptions {
  /** Сколько раз переспросить модель при невалидном ответе. По умолчанию 2 (ADR-007). */
  maxRetries?: number;
  /** Текст сообщения с ошибкой валидации, отправляемого модели перед повтором. */
  buildRetryMessage?: (error: string) => string;
}

export interface ChatJsonResult<T> {
  data: T;
  response: AiChatResponse;
  /** Сколько вызовов модели потребовалось (1 = с первого раза). */
  attempts: number;
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

  let messages: AiChatMessage[] = req.messages;
  let lastError = 'нет ответа';

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const response = await provider.chat({ ...req, messages, responseFormat: 'json' });
    const parsed = parseJsonResponse(response.content, schema);
    if (parsed.ok) return { data: parsed.data, response, attempts: attempt };

    lastError = parsed.error;
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
