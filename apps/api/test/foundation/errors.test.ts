import { Controller, Get, type INestApplication, NotFoundException } from '@nestjs/common';
import { Prisma } from '@edu/db';
import request from 'supertest';
import { ZodError, z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from '../../src/common/auth/decorators';
import { Errors } from '../../src/common/errors/app-error';
import { normalizeException } from '../../src/common/errors/api-exception.filter';
import { createMiniApp } from '../helpers/mini-app';

@Controller('e')
@Public()
class ErrorsTestController {
  @Get('app-error')
  appError() {
    throw Errors.businessRule('Дедлайн прошёл', { dueAt: '2026-01-01' });
  }
  @Get('http')
  http() {
    throw new NotFoundException('Нет такого');
  }
  @Get('zod')
  zod() {
    z.object({ a: z.number() }).parse({ a: 'x' });
  }
  @Get('boom')
  boom() {
    throw new Error('unexpected');
  }
}

describe('единый формат ошибок', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createMiniApp([ErrorsTestController]);
  });
  afterAll(async () => {
    await app.close();
  });

  it('AppError → код и статус из контракта', async () => {
    const res = await request(app.getHttpServer()).get('/e/app-error').expect(422);
    expect(res.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: 'Дедлайн прошёл',
      details: { dueAt: '2026-01-01' },
    });
  });

  it('HttpException → маппинг по статусу', async () => {
    const res = await request(app.getHttpServer()).get('/e/http').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('ZodError → VALIDATION с issues', async () => {
    const res = await request(app.getHttpServer()).get('/e/zod').expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details[0].path).toBe('a');
  });

  it('неизвестная ошибка → INTERNAL без утечки деталей', async () => {
    const res = await request(app.getHttpServer()).get('/e/boom').expect(500);
    expect(res.body.error).toMatchObject({ code: 'INTERNAL', message: 'Внутренняя ошибка' });
    expect(JSON.stringify(res.body)).not.toContain('unexpected');
  });

  it('ошибки Prisma маппятся в NOT_FOUND / CONFLICT', () => {
    const notFound = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2025',
      clientVersion: '6',
    });
    const unique = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: '6',
    });
    expect(normalizeException(notFound)).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(normalizeException(unique)).toMatchObject({ status: 409, code: 'CONFLICT' });
    const withMeta = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: '6',
      meta: { modelName: 'User', target: ['max_user_id'] },
    });
    expect(normalizeException(withMeta).details).toEqual({ fields: ['max_user_id'] });
    const fk = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2003',
      clientVersion: '6',
      meta: { field_name: 'users_school_id_fkey' },
    });
    expect(normalizeException(fk).details).toBeUndefined();
    expect(normalizeException(new ZodError([]))).toMatchObject({ status: 400, code: 'VALIDATION' });
  });
});
