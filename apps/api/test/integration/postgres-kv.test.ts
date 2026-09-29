/**
 * PostgresKeyValueStore на реальной тестовой БД: TTL, инкремент с истечением, перезапись.
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KV_STORE, type KeyValueStore } from '../../src/common/kv/key-value-store';
import { PostgresKeyValueStore } from '../../src/common/kv/postgres-key-value-store';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('PostgresKeyValueStore (integration)', () => {
  let app: INestApplication;
  let kv: KeyValueStore;

  beforeAll(async () => {
    app = await createTestApp({ KV_DRIVER: 'postgres' });
    kv = app.get<KeyValueStore>(KV_STORE);
  });
  afterAll(async () => {
    await app.close();
  });

  it('KV_DRIVER=postgres подставляет реализацию на БД', () => {
    expect(kv).toBeInstanceOf(PostgresKeyValueStore);
  });

  it('set/get/del с произвольным JSON и перезаписью', async () => {
    const key = `test:kv:${Date.now()}`;
    await kv.set(key, { a: 1, b: ['x'] });
    expect(await kv.get(key)).toEqual({ a: 1, b: ['x'] });
    await kv.set(key, 'строка');
    expect(await kv.get(key)).toBe('строка');
    await kv.del(key);
    expect(await kv.get(key)).toBeUndefined();
  });

  it('TTL: протухшая запись не читается', async () => {
    const key = `test:kv:ttl:${Date.now()}`;
    await kv.set(key, 42, 1);
    expect(await kv.get(key)).toBe(42);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await kv.get(key)).toBeUndefined();
  });

  it('incr: растёт атомарно, после истечения начинается с 1', async () => {
    const key = `test:kv:incr:${Date.now()}`;
    expect(await kv.incr(key, 1)).toBe(1);
    expect(await kv.incr(key, 1)).toBe(2);
    const parallel = await Promise.all([kv.incr(key, 1), kv.incr(key, 1), kv.incr(key, 1)]);
    expect([...parallel].sort()).toEqual([3, 4, 5]);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await kv.incr(key, 1)).toBe(1);
  });

  it('setIfAbsent: из параллельных захватов удаётся ровно один; протухший ключ занимается заново', async () => {
    const key = `test:kv:claim:${Date.now()}`;
    const claims = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => kv.setIfAbsent(key, { pending: n }, 60)),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await kv.setIfAbsent(key, 'другое', 60)).toBe(false);

    const expiring = `test:kv:claim:ttl:${Date.now()}`;
    expect(await kv.setIfAbsent(expiring, 1, 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await kv.setIfAbsent(expiring, 2, 60)).toBe(true);
    expect(await kv.get(expiring)).toBe(2);
  });

  it('incr тоже убирает протухшие записи (по случаю, как set)', async () => {
    const prisma = app.get(PrismaService);
    const stale = `test:kv:stale:${Date.now()}`;
    await prisma.$executeRaw`
      INSERT INTO kv_entries (key, value, expires_at, updated_at)
      VALUES (${stale}, '1'::jsonb, now() - interval '1 minute', now())`;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      await kv.incr(`test:kv:sweep:${Date.now()}`, 60);
    } finally {
      random.mockRestore();
    }
    const rows = await prisma.$queryRaw<{ key: string }[]>`
      SELECT key FROM kv_entries WHERE key = ${stale}`;
    expect(rows).toEqual([]);
  });

  it('decr: живой счётчик уменьшается до нуля, отсутствующий ключ не создаётся', async () => {
    const key = `test:kv:decr:${Date.now()}`;
    expect(await kv.decr(key)).toBe(0);
    expect(await kv.get(key)).toBeUndefined();
    await kv.incr(key, 60);
    await kv.incr(key, 60);
    const parallel = await Promise.all([kv.decr(key), kv.decr(key), kv.decr(key)]);
    expect([...parallel].sort()).toEqual([0, 0, 1]);
    expect(await kv.incr(key, 60)).toBe(1);
  });
});
