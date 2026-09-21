import type { ZodTypeAny } from 'zod';
import type { AiChatMessage, AiChatRequest } from '../types';

/**
 * Реестр промптов. Промпт — код в репозитории с версией и (опционально) zod-схемой ответа.
 * Ключ `id@version` пишется в результаты генерации (`AiInsight.promptId` и т.п.), поэтому
 * любое изменение текста промпта, влияющее на результат, — это новая версия.
 */

export interface PromptDefinition<TVars, TSchema extends ZodTypeAny | undefined = undefined> {
  /** Идентификатор вида `insight.student-home`: латиница, цифры, точки, дефисы. */
  id: string;
  /** Целое число ≥ 1. */
  version: number;
  /** Зачем промпт нужен и что ожидается на выходе (для людей и реестра). */
  description: string;
  /** Системное сообщение: строка или функция от переменных. */
  system?: string | ((vars: TVars) => string);
  /** Пользовательское сообщение из переменных. */
  user?: (vars: TVars) => string;
  /** Схема ожидаемого JSON-ответа. Если задана — запрос помечается `responseFormat: 'json'`. */
  schema?: TSchema;
  /** Параметры генерации по умолчанию для этого промпта. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Prompt<
  TVars = Record<string, never>,
  TSchema extends ZodTypeAny | undefined = undefined,
> extends PromptDefinition<TVars, TSchema> {
  /** `${id}@${version}` */
  readonly key: string;
}

/** Промпт с любыми переменными и схемой — для хранения в реестре. */
export type AnyPrompt = Prompt<never, ZodTypeAny | undefined>;

const PROMPT_ID_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

export function promptKey(id: string, version: number): string {
  return `${id}@${version}`;
}

/**
 * Создаёт промпт. Тип переменных выводится из аннотации параметра `user`/`system`:
 * `definePrompt({ ..., user: (vars: { name: string }) => ... })`.
 */
export function definePrompt<
  TVars = Record<string, never>,
  TSchema extends ZodTypeAny | undefined = undefined,
>(definition: PromptDefinition<TVars, TSchema>): Prompt<TVars, TSchema> {
  if (!PROMPT_ID_PATTERN.test(definition.id)) {
    throw new Error(
      `Некорректный id промпта «${definition.id}»: допустимы строчные латинские буквы, цифры, точки и дефисы`,
    );
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`Некорректная версия промпта «${definition.id}»: ожидается целое число ≥ 1`);
  }
  if (!definition.system && !definition.user) {
    throw new Error(`Промпт «${definition.id}» должен задавать system и/или user`);
  }
  return Object.freeze({ ...definition, key: promptKey(definition.id, definition.version) });
}

/**
 * Собирает сообщения: `[system?, ...history, user?]`.
 * `history` — предыдущие реплики диалога (например, чат тьютора).
 */
export function buildMessages<TVars, TSchema extends ZodTypeAny | undefined>(
  prompt: Prompt<TVars, TSchema>,
  vars: TVars,
  history: AiChatMessage[] = [],
): AiChatMessage[] {
  const messages: AiChatMessage[] = [];
  if (prompt.system !== undefined) {
    const content = typeof prompt.system === 'function' ? prompt.system(vars) : prompt.system;
    messages.push({ role: 'system', content });
  }
  messages.push(...history);
  if (prompt.user !== undefined) {
    messages.push({ role: 'user', content: prompt.user(vars) });
  }
  return messages;
}

export interface BuildRequestOptions extends Omit<AiChatRequest, 'messages' | 'metadata'> {
  history?: AiChatMessage[];
  metadata?: Omit<NonNullable<AiChatRequest['metadata']>, 'promptId'>;
}

/**
 * Собирает `AiChatRequest` из промпта: сообщения, параметры генерации по умолчанию,
 * `responseFormat: 'json'` при наличии схемы и `metadata.promptId = key`.
 */
export function buildRequest<TVars, TSchema extends ZodTypeAny | undefined>(
  prompt: Prompt<TVars, TSchema>,
  vars: TVars,
  options: BuildRequestOptions = {},
): AiChatRequest {
  const { history, metadata, ...overrides } = options;
  const request: AiChatRequest = {
    messages: buildMessages(prompt, vars, history),
    metadata: { ...metadata, promptId: prompt.key },
  };
  const model = overrides.model ?? prompt.model;
  const temperature = overrides.temperature ?? prompt.temperature;
  const maxTokens = overrides.maxTokens ?? prompt.maxTokens;
  const responseFormat = overrides.responseFormat ?? (prompt.schema ? 'json' : undefined);
  if (model !== undefined) request.model = model;
  if (temperature !== undefined) request.temperature = temperature;
  if (maxTokens !== undefined) request.maxTokens = maxTokens;
  if (responseFormat !== undefined) request.responseFormat = responseFormat;
  if (overrides.signal !== undefined) request.signal = overrides.signal;
  return request;
}

export class PromptRegistry {
  private readonly prompts = new Map<string, AnyPrompt>();

  /** Регистрирует промпт; дубликат ключа — ошибка. Возвращает тот же промпт для удобства. */
  register<P extends AnyPrompt>(prompt: P): P {
    if (this.prompts.has(prompt.key)) {
      throw new Error(`Промпт «${prompt.key}» уже зарегистрирован`);
    }
    this.prompts.set(prompt.key, prompt);
    return prompt;
  }

  registerAll(prompts: AnyPrompt[]): this {
    for (const prompt of prompts) this.register(prompt);
    return this;
  }

  /** Возвращает промпт по ключу `id@version`; если нет — ошибка. */
  get(key: string): AnyPrompt {
    const prompt = this.prompts.get(key);
    if (!prompt) throw new Error(`Промпт «${key}» не зарегистрирован`);
    return prompt;
  }

  find(key: string): AnyPrompt | undefined {
    return this.prompts.get(key);
  }

  has(key: string): boolean {
    return this.prompts.has(key);
  }

  /** Все промпты, отсортированные по ключу. */
  list(): AnyPrompt[] {
    return [...this.prompts.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  get size(): number {
    return this.prompts.size;
  }
}
