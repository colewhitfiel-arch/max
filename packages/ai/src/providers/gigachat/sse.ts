import { abortReason } from '../../abort';

export interface SseEvent {
  event?: string;
  id?: string;
  data: string;
}

/**
 * Разбирает поток Server-Sent Events: строки `data:` одного события склеиваются через `\n`,
 * пустая строка завершает событие, `:`-строки (комментарии) пропускаются.
 * При отмене `signal` чтение прерывается и бросается причина отмены. Если потребитель вышел из
 * итерации раньше конца потока (`break`/`return`/ошибка), тело отменяется (`reader.cancel()`).
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => {
    reader.cancel(abortReason(signal as AbortSignal)).catch(() => {});
  };
  if (signal?.aborted) onAbort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let buffer = '';
  let event: string | undefined;
  let id: string | undefined;
  let dataLines: string[] = [];
  let completed = false;

  const flush = (): SseEvent | undefined => {
    if (dataLines.length === 0) {
      event = undefined;
      id = undefined;
      return undefined;
    }
    const result: SseEvent = { data: dataLines.join('\n') };
    if (event !== undefined) result.event = event;
    if (id !== undefined) result.id = id;
    dataLines = [];
    event = undefined;
    id = undefined;
    return result;
  };

  const handleLine = (line: string): SseEvent | undefined => {
    if (line === '') return flush();
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
    return undefined;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r?\n/);
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + (buffer[newline] === '\r' ? 2 : 1));
        const parsed = handleLine(line);
        if (parsed) yield parsed;
        newline = buffer.search(/\r?\n/);
      }
    }
    if (signal?.aborted) throw abortReason(signal);
    buffer += decoder.decode();
    if (buffer.length > 0) {
      const parsed = handleLine(buffer);
      if (parsed) yield parsed;
    }
    completed = true;
    const last = flush();
    if (last) yield last;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (!completed) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
