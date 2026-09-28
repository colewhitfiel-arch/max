/**
 * Токены в пути запроса (приглашение родителя, локальная ссылка на файл) не попадают в лог:
 * ни в строку доступа (HttpLoggingInterceptor), ни в лог ошибки (ApiExceptionFilter).
 */
import type { ArgumentsHost, CallHandler, ExecutionContext } from '@nestjs/common';
import pino from 'pino';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from '../../src/common/errors/api-exception.filter';
import { Errors } from '../../src/common/errors/app-error';
import { HttpLoggingInterceptor } from '../../src/common/logger/http-logging.interceptor';
import type { AppLogger } from '../../src/common/logger/logger.service';
import { redactPath } from '../../src/common/logger/redact-path';

const TOKEN = '4rMw7e3fuBzOSWqIO7fpB1aLa5qEE8EM';

function captureLogger(): { logger: AppLogger; entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  const root = pino(
    { level: 'debug' },
    { write: (line: string) => entries.push(JSON.parse(line)) },
  );
  return { logger: { child: (b: Record<string, unknown>) => root.child(b) } as AppLogger, entries };
}

function httpContext(req: object, res: object): ExecutionContext & ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext & ArgumentsHost;
}

describe('токены в пути запроса не попадают в лог', () => {
  it('redactPath заменяет токен приглашения и подписанную ссылку на файл', () => {
    expect(redactPath(`/api/v1/student/parent-invites/${TOKEN}`)).toBe(
      '/api/v1/student/parent-invites/[redacted]',
    );
    expect(redactPath(`/api/v1/student/parent-invites/${TOKEN}/accept`)).toBe(
      '/api/v1/student/parent-invites/[redacted]/accept',
    );
    expect(redactPath(`/api/v1/files/local/eyJrZXkiOiJz.sig?x=1`)).toBe(
      '/api/v1/files/local/[redacted]?x=1',
    );
    expect(redactPath('/api/v1/student/home?limit=5')).toBe('/api/v1/student/home?limit=5');
  });

  it('строка доступа HttpLoggingInterceptor', async () => {
    const { logger, entries } = captureLogger();
    const interceptor = new HttpLoggingInterceptor(logger);
    const req = { method: 'POST', originalUrl: `/api/v1/student/parent-invites/${TOKEN}/accept` };
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await lastValueFrom(interceptor.intercept(httpContext(req, { statusCode: 200 }), next));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: '/api/v1/student/parent-invites/[redacted]/accept' });
    expect(JSON.stringify(entries)).not.toContain(TOKEN);
  });

  it('лог ошибки ApiExceptionFilter', () => {
    const { logger, entries } = captureLogger();
    const filter = new ApiExceptionFilter(logger);
    const req = { method: 'GET', originalUrl: `/api/v1/student/parent-invites/${TOKEN}` };
    const res = { headersSent: false, status: () => ({ json: () => undefined }) };
    filter.catch(Errors.notFound('Приглашение'), httpContext(req, res));
    filter.catch(new Error('boom'), httpContext(req, res));
    expect(entries).toHaveLength(2);
    for (const entry of entries)
      expect(entry).toMatchObject({ path: '/api/v1/student/parent-invites/[redacted]' });
    expect(JSON.stringify(entries)).not.toContain(TOKEN);
  });
});
