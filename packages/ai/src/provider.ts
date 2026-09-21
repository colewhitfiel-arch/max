import type {
  AiChatRequest,
  AiChatResponse,
  AiEmbedRequest,
  AiEmbedResponse,
  AiStreamChunk,
} from './types';

/**
 * Порт к языковой модели. Единственная точка контакта feature-модулей с ИИ:
 * модули получают `AiProvider` (обычно через `AiService`) и не знают, GigaChat это или mock.
 *
 * Контракт ошибок:
 * - `chat`/`embed` отклоняют промис `AiProviderError`; отмена через `signal` — исходной причиной отмены.
 * - `stream` не бросает: ошибки приходят чанком `{ type: 'error' }`, после чего итерация завершается.
 *   При отмене через `signal` итерация просто завершается без `done`.
 */
export interface AiProvider {
  readonly name: string;
  chat(req: AiChatRequest): Promise<AiChatResponse>;
  stream(req: AiChatRequest): AsyncIterable<AiStreamChunk>;
  embed(req: AiEmbedRequest): Promise<AiEmbedResponse>;
}

/** Имя порта в документации (docs/02, docs/06, ADR-007). */
export type LlmProvider = AiProvider;
