import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type ApiError, type ErrorCode } from '@edu/contracts';
import { Prisma } from '@edu/db';
import { RequestValidationError } from '@ts-rest/nest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppLogger } from '../logger/logger.service';
import { getRequestId } from '../logger/request-context';
import { AppError } from './app-error';

interface Normalized {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
  /** Только для лога (внутренние подробности, которые клиенту не отдаются). */
  logMeta?: Record<string, unknown>;
  logLevel: 'warn' | 'error' | 'debug';
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE',
  429: 'RATE_LIMITED',
  501: 'NOT_IMPLEMENTED',
  502: 'EXTERNAL_INTEGRATION',
};

function zodIssues(error: ZodError): unknown {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
}

export function normalizeException(exception: unknown): Normalized {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      logLevel: exception.status >= 500 ? 'error' : 'debug',
    };
  }
  if (exception instanceof RequestValidationError) {
    const details: Record<string, unknown> = {};
    if (exception.pathParams) details.pathParams = zodIssues(exception.pathParams);
    if (exception.query) details.query = zodIssues(exception.query);
    if (exception.body) details.body = zodIssues(exception.body);
    if (exception.headers) details.headers = zodIssues(exception.headers);
    return {
      status: 400,
      code: 'VALIDATION',
      message: 'Некорректные данные запроса',
      details,
      logLevel: 'debug',
    };
  }
  if (exception instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION',
      message: 'Некорректные данные',
      details: zodIssues(exception),
      logLevel: 'debug',
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
    return {
      status,
      code: STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION'),
      message,
      logLevel: status >= 500 ? 'error' : 'debug',
    };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2025')
      return { status: 404, code: 'NOT_FOUND', message: 'Объект не найден', logLevel: 'debug' };
    // meta Prisma (модель, констрейнт, колонки) наружу не уходит — только в лог
    const logMeta = { prismaCode: exception.code, meta: exception.meta };
    if (exception.code === 'P2002') {
      const target = exception.meta?.target;
      const fields = Array.isArray(target)
        ? target.filter((x): x is string => typeof x === 'string')
        : [];
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'Нарушение уникальности',
        ...(fields.length > 0 ? { details: { fields } } : {}),
        logMeta,
        logLevel: 'warn',
      };
    }
    if (exception.code === 'P2003')
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'Нарушение ссылочной целостности',
        logMeta,
        logLevel: 'warn',
      };
    return { status: 500, code: 'INTERNAL', message: 'Ошибка базы данных', logLevel: 'error' };
  }
  if (exception instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, code: 'INTERNAL', message: 'База данных недоступна', logLevel: 'error' };
  }
  return { status: 500, code: 'INTERNAL', message: 'Внутренняя ошибка', logLevel: 'error' };
}

/** Единый формат ошибок API (docs/05 §5.1) + логирование с request-id. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log;

  constructor(logger: AppLogger) {
    this.log = logger.child({ module: 'http-error' });
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = getRequestId();
    const n = normalizeException(exception);

    const entry = {
      method: req.method,
      path: req.originalUrl ?? req.url,
      status: n.status,
      code: n.code,
    };
    if (n.logLevel === 'error') this.log.error({ ...entry, err: exception }, n.message);
    else if (n.logLevel === 'warn') this.log.warn({ ...entry, ...n.logMeta }, n.message);
    else this.log.debug(entry, n.message);

    const body: ApiError = {
      error: {
        code: n.code,
        message: n.message,
        ...(n.details !== undefined ? { details: n.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    if (res.headersSent) return;
    res.status(n.status || HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
