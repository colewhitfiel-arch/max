/**
 * PostgresKeyValueStore на реальной тестовой БД: TTL, инкремент с истечением, перезапись.
 * Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KV_STORE, type KeyValueStore } from '../../src/common/kv/key-value-store';
import { PostgresKeyValueStore } from '../../src/common/kv/postgres-key-value-store';
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
});
