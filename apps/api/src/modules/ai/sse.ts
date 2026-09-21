import type { Request, Response } from 'express';
import type { AiStreamEvent } from '@edu/contracts';

export interface SseSink {
  /** Пишет событие; при первом вызове открывает поток (заголовки). */
  write(event: AiStreamEvent): void;
  end(): void;
  /** Срабатывает, когда клиент закрыл соединение. */
  signal: AbortSignal;
  readonly opened: boolean;
}

/**
 * SSE поверх express Response. Заголовки отправляются лениво — при первом событии, поэтому ошибки
 * до начала стрима (403/404/429) уходят обычным JSON через ApiExceptionFilter.
 */
export function createSseSink(req: Request, res: Response): SseSink {
  const controller = new AbortController();
  let opened = false;
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return {
    get opened() {
      return opened;
    },
    signal: controller.signal,
    write(event) {
      if (res.writableEnded) return;
      if (!opened) {
        opened = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    end() {
      if (!res.writableEnded) res.end();
    },
  };
}
