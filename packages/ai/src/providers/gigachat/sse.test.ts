import { describe, expect, it } from 'vitest';
import { parseSse, type SseEvent } from './sse';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const events: SseEvent[] = [];
  for await (const event of parseSse(stream, signal)) events.push(event);
  return events;
}

describe('parseSse', () => {
  it('разбирает события, комментарии, многострочные data и CRLF', async () => {
    const events = await collect(
      streamOf([
        ': ping\n',
        'event: message\nid: 1\ndata: {"a":1}\n\n',
        'data: line1\r\ndata: line2\r\n\r\n',
        'data:[DONE]\n\n',
      ]),
    );
    expect(events).toEqual([
      { event: 'message', id: '1', data: '{"a":1}' },
      { data: 'line1\nline2' },
      { data: '[DONE]' },
    ]);
  });

  it('склеивает строки, разрезанные по границам чанков (в том числе внутри UTF-8)', async () => {
    const text = 'data: {"content":"привет"}\n\ndata: {"content":"мир"}\n\n';
    const bytes = new TextEncoder().encode(text);
    // режем в середине многобайтового символа
    const cut = 20;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut, cut + 7));
        controller.enqueue(bytes.slice(cut + 7));
        controller.close();
      },
    });
    const events = await collect(stream);
    expect(events.map((e) => e.data)).toEqual(['{"content":"привет"}', '{"content":"мир"}']);
  });

  it('отдаёт последнее событие без завершающей пустой строки', async () => {
    const events = await collect(streamOf(['data: tail']));
    expect(events).toEqual([{ data: 'tail' }]);
  });

  it('прерывается по signal причиной отмены', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('data: first\n\n'));
        // поток намеренно не закрывается
      },
    });
    const events: SseEvent[] = [];
    await expect(
      (async () => {
        for await (const event of parseSse(stream, controller.signal)) {
          events.push(event);
          controller.abort(new Error('stop'));
        }
      })(),
    ).rejects.toThrow('stop');
    expect(events).toEqual([{ data: 'first' }]);
  });

  it('досрочный выход потребителя отменяет тело, полностью прочитанное — нет', async () => {
    let cancelled = 0;
    const encoder = new TextEncoder();
    const open = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: a\n\ndata: b\n\n'));
        // поток не закрывается — сервер ещё «пишет»
      },
      cancel() {
        cancelled += 1;
      },
    });
    for await (const event of parseSse(open)) {
      expect(event.data).toBe('a');
      break;
    }
    expect(cancelled).toBe(1);

    const closed = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: a\n\n'));
        controller.close();
      },
      cancel() {
        cancelled += 1;
      },
    });
    expect((await collect(closed)).map((e) => e.data)).toEqual(['a']);
    expect(cancelled).toBe(1);
  });
});
