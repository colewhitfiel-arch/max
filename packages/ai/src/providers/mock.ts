import { sleep } from '../abort';
import type { AiProvider } from '../provider';
import type {
  AiChatRequest,
  AiChatResponse,
  AiEmbedRequest,
  AiEmbedResponse,
  AiStreamChunk,
} from '../types';
import { toAiProviderError } from '../types';

/**
 * Детерминированный провайдер для тестов, MSW и локальной разработки без сети.
 * В документации упоминается как `FakeLlmProvider`.
 */

export type MockMatcher = ((req: AiChatRequest) => boolean) | RegExp | string;

export interface MockResponseRule {
  /**
   * Строка/RegExp сравниваются с последним user-сообщением;
   * функция получает весь запрос (можно матчить по `metadata.promptId`).
   */
  match: MockMatcher;
  content: string | ((req: AiChatRequest) => string);
  /** Правило срабатывает один раз, затем удаляется (удобно для сценариев «сначала ошибка, потом успех»). */
  once?: boolean;
}

export interface MockAiProviderOptions {
  responses?: MockResponseRule[];
  /** Ответ без совпадений. По умолчанию — эхо последнего user-сообщения с префиксом `[mock] `. */
  defaultResponse?: string | ((req: AiChatRequest) => string);
  /** Искусственная задержка перед ответом (учитывает `signal`). */
  delayMs?: number;
  /** Ошибка для каждого вызова `chat`/`stream`/`embed`; функция может вернуть `undefined` (не падать). */
  failWith?:
    Error | ((req: AiChatRequest | AiEmbedRequest, callIndex: number) => Error | undefined);
  model?: string;
  embeddingModel?: string;
}

export const MOCK_EMBEDDING_DIMENSIONS = 8;

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  /** Все запросы `chat`/`stream` — для ассертов в тестах. */
  readonly calls: AiChatRequest[] = [];
  readonly embedCalls: AiEmbedRequest[] = [];

  private readonly rules: MockResponseRule[];
  private readonly options: MockAiProviderOptions;

  constructor(options: MockAiProviderOptions = {}) {
    this.options = options;
    this.rules = [...(options.responses ?? [])];
  }

  get model(): string {
    return this.options.model ?? 'mock-chat';
  }

  reset(): void {
    this.calls.length = 0;
    this.embedCalls.length = 0;
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    this.calls.push(req);
    await this.delay(req.signal);
    this.maybeFail(req, this.calls.length - 1);
    return this.buildResponse(req);
  }

  async *stream(req: AiChatRequest): AsyncIterable<AiStreamChunk> {
    let response: AiChatResponse;
    try {
      response = await this.chat(req);
    } catch (error) {
      if (req.signal?.aborted) return;
      yield { type: 'error', error: toAiProviderError(error) };
      return;
    }
    for (const token of tokenize(response.content)) {
      if (req.signal?.aborted) return;
      yield { type: 'token', text: token };
    }
    yield { type: 'done', response };
  }

  async embed(req: AiEmbedRequest): Promise<AiEmbedResponse> {
    this.embedCalls.push(req);
    await this.delay(req.signal);
    this.maybeFail(req, this.embedCalls.length - 1);
    const vectors = req.input.map((text) => hashVector(text, MOCK_EMBEDDING_DIMENSIONS));
    const promptTokens = req.input.reduce((sum, text) => sum + Math.ceil(text.length / 3), 0);
    return {
      vectors,
      model: req.model ?? this.options.embeddingModel ?? 'mock-embeddings',
      usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
    };
  }

  private async delay(signal?: AbortSignal): Promise<void> {
    if (this.options.delayMs && this.options.delayMs > 0) await sleep(this.options.delayMs, signal);
    else if (signal?.aborted) await sleep(0, signal);
  }

  private maybeFail(req: AiChatRequest | AiEmbedRequest, callIndex: number): void {
    const { failWith } = this.options;
    if (!failWith) return;
    const error = typeof failWith === 'function' ? failWith(req, callIndex) : failWith;
    if (error) throw error;
  }

  private buildResponse(req: AiChatRequest): AiChatResponse {
    const content = this.resolveContent(req);
    const promptTokens = req.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 3), 0);
    const completionTokens = Math.ceil(content.length / 3);
    return {
      content,
      model: req.model ?? this.model,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      finishReason: 'stop',
    };
  }

  private resolveContent(req: AiChatRequest): string {
    const lastUser = lastUserMessage(req);
    const index = this.rules.findIndex((rule) => matches(rule.match, req, lastUser));
    if (index >= 0) {
      const rule = this.rules[index] as MockResponseRule;
      if (rule.once) this.rules.splice(index, 1);
      return typeof rule.content === 'function' ? rule.content(req) : rule.content;
    }
    const { defaultResponse } = this.options;
    if (defaultResponse !== undefined) {
      return typeof defaultResponse === 'function' ? defaultResponse(req) : defaultResponse;
    }
    if (req.responseFormat === 'json') return '{}';
    return `[mock] ${lastUser}`;
  }
}

/** Алиас под название из документации (docs/06, ADR-007). */
export { MockAiProvider as FakeLlmProvider };

function lastUserMessage(req: AiChatRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i -= 1) {
    const message = req.messages[i];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

function matches(matcher: MockMatcher, req: AiChatRequest, lastUser: string): boolean {
  if (typeof matcher === 'function') return matcher(req);
  if (matcher instanceof RegExp) return matcher.test(lastUser);
  return lastUser.includes(matcher);
}

/** Режет текст на «токены» по словам, сохраняя пробелы: `"a b"` → `["a ", "b"]`. */
export function tokenize(text: string): string[] {
  if (text.length === 0) return [];
  return text.match(/\S+\s*|\s+/g) ?? [text];
}

/** FNV-1a 32-bit. */
function fnv1a(text: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Детерминированный псевдо-эмбеддинг: `dims` хешей с разными seed, нормированный по L2. */
export function hashVector(text: string, dims: number): number[] {
  const raw: number[] = [];
  for (let d = 0; d < dims; d += 1) {
    // [0, 2^32) → [-1, 1]
    raw.push((fnv1a(text, d * 0x9e3779b9) / 0xffffffff) * 2 - 1);
  }
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0)) || 1;
  return raw.map((v) => Number((v / norm).toFixed(6)));
}
