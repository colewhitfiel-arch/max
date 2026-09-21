import { randomUUID } from 'node:crypto';
import type { ZodTypeAny, z } from 'zod';
import { createAiProvider, type AiConfig, type CreateAiProviderDeps } from './config';
import { chatJson, type ChatJsonOptions, type ChatJsonResult } from './json';
import type { AiLogger } from './logger';
import {
  describeEmbedRequest,
  describeError,
  describeRequest,
  describeResponse,
  noopLogger,
} from './logger';
import type { AiProvider } from './provider';
import type {
  AiChatRequest,
  AiChatResponse,
  AiEmbedRequest,
  AiEmbedResponse,
  AiStreamChunk,
} from './types';

export interface AiServiceOptions {
  provider: AiProvider;
  logger?: AiLogger;
  /** Модель по умолчанию, если запрос её не задаёт (иначе решает провайдер). */
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  generateRequestId?: () => string;
  now?: () => number;
}

/**
 * Тонкая обёртка над провайдером — то, что получают модули `apps/api`:
 * проставляет `requestId`, применяет дефолты, замеряет длительность и пишет безопасную мету в лог.
 * Сам реализует `AiProvider`, поэтому подходит везде, где ждут провайдера (например, в `chatJson`).
 */
export class AiService implements AiProvider {
  readonly provider: AiProvider;

  private readonly logger: AiLogger;
  private readonly options: AiServiceOptions;
  private readonly now: () => number;
  private readonly generateRequestId: () => string;

  constructor(options: AiServiceOptions) {
    this.options = options;
    this.provider = options.provider;
    this.logger = options.logger ?? noopLogger;
    this.now = options.now ?? Date.now;
    this.generateRequestId = options.generateRequestId ?? randomUUID;
  }

  get name(): string {
    return this.provider.name;
  }

  async chat(req: AiChatRequest): Promise<AiChatResponse> {
    const prepared = this.prepareChat(req);
    const meta = describeRequest(prepared);
    const started = this.now();
    this.logger.debug('ai.chat.start', meta);
    try {
      const response = await this.provider.chat(prepared);
      this.logger.info('ai.chat.done', {
        ...meta,
        ...describeResponse(response),
        durationMs: this.now() - started,
      });
      return response;
    } catch (error) {
      this.logger.error('ai.chat.failed', {
        ...meta,
        ...describeError(error),
        durationMs: this.now() - started,
      });
      throw error;
    }
  }

  async *stream(req: AiChatRequest): AsyncIterable<AiStreamChunk> {
    const prepared = this.prepareChat(req);
    const meta = describeRequest(prepared);
    const started = this.now();
    let firstTokenMs: number | undefined;
    let tokens = 0;
    let chars = 0;
    this.logger.debug('ai.stream.start', meta);

    for await (const chunk of this.provider.stream(prepared)) {
      if (chunk.type === 'token') {
        if (firstTokenMs === undefined) firstTokenMs = this.now() - started;
        tokens += 1;
        chars += chunk.text.length;
      } else if (chunk.type === 'done') {
        this.logger.info('ai.stream.done', {
          ...meta,
          ...describeResponse(chunk.response),
          streamedTokens: tokens,
          streamedChars: chars,
          firstTokenMs,
          durationMs: this.now() - started,
        });
      } else {
        this.logger.error('ai.stream.failed', {
          ...meta,
          ...describeError(chunk.error),
          streamedTokens: tokens,
          streamedChars: chars,
          durationMs: this.now() - started,
        });
      }
      yield chunk;
    }
  }

  async embed(req: AiEmbedRequest): Promise<AiEmbedResponse> {
    const prepared: AiEmbedRequest = {
      ...req,
      metadata: { ...req.metadata, requestId: req.metadata?.requestId ?? this.generateRequestId() },
    };
    const meta = describeEmbedRequest(prepared);
    const started = this.now();
    try {
      const response = await this.provider.embed(prepared);
      this.logger.info('ai.embed.done', {
        ...meta,
        responseModel: response.model,
        vectors: response.vectors.length,
        dimensions: response.vectors[0]?.length ?? 0,
        totalTokens: response.usage?.totalTokens,
        durationMs: this.now() - started,
      });
      return response;
    } catch (error) {
      this.logger.error('ai.embed.failed', {
        ...meta,
        ...describeError(error),
        durationMs: this.now() - started,
      });
      throw error;
    }
  }

  /** Структурированный ответ по zod-схеме с ретраями на невалидный JSON (см. `json.ts`). */
  chatJson<S extends ZodTypeAny>(
    req: AiChatRequest,
    schema: S,
    options?: ChatJsonOptions,
  ): Promise<ChatJsonResult<z.output<S>>> {
    // requestId проставляется один раз — все попытки одного chatJson логируются под ним.
    return chatJson(this, this.prepareChat(req), schema, options);
  }

  private prepareChat(req: AiChatRequest): AiChatRequest {
    const prepared: AiChatRequest = {
      ...req,
      metadata: { ...req.metadata, requestId: req.metadata?.requestId ?? this.generateRequestId() },
    };
    if (prepared.model === undefined && this.options.defaultModel !== undefined) {
      prepared.model = this.options.defaultModel;
    }
    if (prepared.temperature === undefined && this.options.defaultTemperature !== undefined) {
      prepared.temperature = this.options.defaultTemperature;
    }
    if (prepared.maxTokens === undefined && this.options.defaultMaxTokens !== undefined) {
      prepared.maxTokens = this.options.defaultMaxTokens;
    }
    return prepared;
  }
}

export interface CreateAiServiceOptions extends CreateAiProviderDeps {
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

/** Провайдер по конфигу + сервис одним вызовом. */
export function createAiService(config: AiConfig, options: CreateAiServiceOptions = {}): AiService {
  const { logger, fetch, ...serviceOptions } = options;
  const provider = createAiProvider(config, { logger, fetch });
  return new AiService({ provider, logger, ...serviceOptions });
}
