import type { PrismaService } from '../prisma/prisma.service';
import type { KeyValueStore } from './key-value-store';

/**
 * Key-value на таблице `kv_entries` (packages/db/prisma/schema/kv.prisma). Для serverless,
 * где память процесса не разделяется между инстансами: идемпотентность, дневные лимиты,
 * кэш контекста должны быть общими. Протухшие записи не читаются; чистятся по случаю в set().
 */
export class PostgresKeyValueStore implements KeyValueStore {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const rows = await this.prisma.$queryRaw<{ value: T }[]>`
      SELECT value FROM kv_entries
      WHERE key = ${key} AND (expires_at IS NULL OR expires_at > now())`;
    return rows[0]?.value;
  }

  async set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void> {
    const expiresAt = ttlSec ? new Date(Date.now() + ttlSec * 1000) : null;
    await this.prisma.$executeRaw`
      INSERT INTO kv_entries (key, value, expires_at, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${expiresAt}::timestamptz, now())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()`;
    // Дешёвая уборка: одна запись из ста уносит с собой всё протухшее
    if (Math.random() < 0.01) {
      await this.prisma.$executeRaw`DELETE FROM kv_entries WHERE expires_at <= now()`;
    }
  }

  /** Атомарно: вставка или перезапись только протухшей записи; живую не трогает. */
  async setIfAbsent<T = unknown>(key: string, value: T, ttlSec?: number): Promise<boolean> {
    const expiresAt = ttlSec ? new Date(Date.now() + ttlSec * 1000) : null;
    const rows = await this.prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO kv_entries (key, value, expires_at, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${expiresAt}::timestamptz, now())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()
        WHERE kv_entries.expires_at IS NOT NULL AND kv_entries.expires_at <= now()
      RETURNING key`;
    return rows.length > 0;
  }

  async del(key: string): Promise<void> {
    await this.prisma.$executeRaw`DELETE FROM kv_entries WHERE key = ${key}`;
  }

  /** Атомарно: протухший счётчик начинается заново с 1, живой — растёт с прежним сроком. */
  async incr(key: string, ttlSec: number): Promise<number> {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const rows = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO kv_entries (key, value, expires_at, updated_at)
      VALUES (${key}, '1'::jsonb, ${expiresAt}::timestamptz, now())
      ON CONFLICT (key) DO UPDATE SET
        value = CASE
          WHEN kv_entries.expires_at IS NOT NULL AND kv_entries.expires_at <= now() THEN '1'::jsonb
          ELSE to_jsonb((kv_entries.value #>> '{}')::bigint + 1)
        END,
        expires_at = CASE
          WHEN kv_entries.expires_at IS NOT NULL AND kv_entries.expires_at <= now() THEN EXCLUDED.expires_at
          ELSE kv_entries.expires_at
        END,
        updated_at = now()
      RETURNING (value #>> '{}')::int AS value`;
    return Number(rows[0]?.value ?? 1);
  }

  /** Атомарно: только живой счётчик, не ниже нуля, срок жизни прежний. */
  async decr(key: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ value: number }[]>`
      UPDATE kv_entries
      SET value = to_jsonb(GREATEST((value #>> '{}')::bigint - 1, 0)), updated_at = now()
      WHERE key = ${key} AND (expires_at IS NULL OR expires_at > now())
      RETURNING (value #>> '{}')::int AS value`;
    return Number(rows[0]?.value ?? 0);
  }
}
