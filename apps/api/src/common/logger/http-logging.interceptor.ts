import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { AppLogger } from './logger.service';
import { redactPath } from './redact-path';

/** Одна строка лога на HTTP-запрос: метод, путь (без токенов в сегментах), статус, длительность. Без тел. */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly log;

  constructor(logger: AppLogger) {
    this.log = logger.child({ module: 'http' });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();
    const finish = (error?: unknown) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const entry = {
        method: req.method,
        path: redactPath(req.originalUrl ?? req.url),
        status: res.statusCode,
        ms: Math.round(ms),
      };
      if (error) return; // ошибки логирует ApiExceptionFilter с деталями
      if (entry.path.includes('/health')) this.log.debug(entry, 'request');
      else this.log.info(entry, 'request');
    };
    return next.handle().pipe(tap({ next: () => finish(), error: (e) => finish(e) }));
  }
}
