export const KV_STORE = Symbol('KV_STORE');

/**
 * Простое key-value хранилище с TTL: идемпотентность, rate-limit, кэш StudentContext.
 * Реализации: MemoryKeyValueStore (dev/test), PostgresKeyValueStore (serverless).
 */
export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void>;
  /**
   * Атомарный захват ключа (SET NX): записывает значение, только если живого ключа нет
   * (отсутствует или протух). `true` — ключ занят этим вызовом, `false` — он уже был.
   */
  setIfAbsent<T = unknown>(key: string, value: T, ttlSec?: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Атомарный инкремент со сроком жизни (для rate-limit). Возвращает новое значение. */
  incr(key: string, ttlSec: number): Promise<number>;
  /**
   * Атомарный декремент живого счётчика (вернуть попытку). Срок жизни не меняется, ниже нуля
   * не опускается; нет ключа (или протух) — ничего не создаёт и возвращает 0.
   */
  decr(key: string): Promise<number>;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, { value: unknown; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.live(key)?.value as T | undefined;
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    this.map.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
  }

  async setIfAbsent<T>(key: string, value: T, ttlSec?: number): Promise<boolean> {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSec);
    return true;
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    const entry = this.live(key);
    const next = ((entry?.value as number | undefined) ?? 0) + 1;
    this.map.set(key, { value: next, expiresAt: entry?.expiresAt ?? Date.now() + ttlSec * 1000 });
    return next;
  }

  async decr(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    const next = Math.max(0, Number(entry.value ?? 0) - 1);
    entry.value = next;
    return next;
  }
}
