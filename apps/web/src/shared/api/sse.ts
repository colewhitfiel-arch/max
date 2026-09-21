/**
 * SSE-стрим ответов ИИ (docs/02 §2.8): `fetch` + `ReadableStream`, события `AiStreamEvent`.
 * Пути и схемы тел — `STREAMING_ROUTES` из контракта; путь так же под `config.apiUrl`.
 */
import { type AiStreamEvent, AiStreamEventSchema } from '@edu/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config';
import { authHeaders, newRequestId } from './client';
import { ApiClientError, apiErrorFromException, apiErrorFromResponse } from './errors';

export interface StreamSseOptions {
  /** Путь относительно базы API, например `/ai/conversations/:id/messages`. */
  path: string;
  body: unknown;
  signal?: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
}

/** Разбирает буфер SSE: возвращает готовые события и «хвост» без завершающей пустой строки. */
export function parseSseChunk(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  return { events: parts, rest };
}

/** Извлекает JSON из `data:`-строк одного события (несколько строк data склеиваются). */
export function parseSseEvent(raw: string): AiStreamEvent | null {
  const data = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    const parsed = AiStreamEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Открывает поток и вызывает onEvent на каждое событие; резолвится по окончании потока. */
export async function streamSse({ path, body, signal, onEvent }: StreamSseOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Request-Id': newRequestId(),
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    throw apiErrorFromException(cause);
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = undefined;
    }
    throw apiErrorFromResponse(response.status, errorBody);
  }
  if (!response.body) {
    throw new ApiClientError({ code: 'INTERNAL', message: 'Пустой поток', status: 0 });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      for (const raw of events) {
        const event = parseSseEvent(raw);
        if (event) onEvent(event);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseSseEvent(buffer);
      if (event) onEvent(event);
    }
  } catch (cause) {
    throw apiErrorFromException(cause);
  }
}

export type AiStreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface AiStreamState {
  status: AiStreamStatus;
  /** Накопленный текст ответа. */
  text: string;
  /** id сохранённого сообщения из события done. */
  messageId: string | null;
  /** Полное событие done (isComplete / profileDraft для онбординга). */
  done: Extract<AiStreamEvent, { type: 'done' }> | null;
  error: ApiClientError | null;
}

const INITIAL: AiStreamState = {
  status: 'idle',
  text: '',
  messageId: null,
  done: null,
  error: null,
};

/** Хук стрима: `start(path, body)` копит токены в `text`, `abort()` прерывает, `reset()` очищает. */
export function useAiStream() {
  const [state, setState] = useState<AiStreamState>(INITIAL);
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abort();
    setState(INITIAL);
  }, [abort]);

  const start = useCallback(
    async (path: string, body: unknown): Promise<AiStreamState> => {
      abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      let current: AiStreamState = { ...INITIAL, status: 'streaming' };
      setState(current);
      const update = (patch: Partial<AiStreamState>) => {
        current = { ...current, ...patch };
        setState(current);
      };
      try {
        await streamSse({
          path,
          body,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'token') update({ text: current.text + event.text });
            else if (event.type === 'done') {
              update({ status: 'done', messageId: event.messageId, done: event });
            } else {
              update({
                status: 'error',
                error: new ApiClientError({ code: 'INTERNAL', message: event.message, status: 0 }),
              });
            }
          },
        });
        if (current.status === 'streaming') update({ status: 'done' });
      } catch (cause) {
        // Прерывание пользователем — не ошибка: оставляем накопленный текст, статус done.
        if (controller.signal.aborted) update({ status: 'done' });
        else update({ status: 'error', error: apiErrorFromException(cause) });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
      return current;
    },
    [abort],
  );

  useEffect(() => abort, [abort]);

  return { ...state, start, abort, reset, isStreaming: state.status === 'streaming' };
}
