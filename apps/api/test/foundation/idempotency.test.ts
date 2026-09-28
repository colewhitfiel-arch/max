/**
 * `runIdempotent`: ключ занимается атомарно до операции — параллельные запросы с одним
 * `Idempotency-Key` не выполняют её дважды (docs/05 §5.1).
 */
import { describe, expect, it } from 'vitest';
import { runIdempotent } from '../../src/common/kv/idempotency';
import { MemoryKeyValueStore } from '../../src/common/kv/key-value-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('runIdempotent', () => {
  it('параллельный запрос с тем же ключом не выполняет операцию второй раз', async () => {
    const kv = new MemoryKeyValueStore();
    const gate = deferred<number>();
    let runs = 0;
    const run = async () => {
      runs += 1;
      return gate.promise;
    };

    const first = runIdempotent(kv, 'k', 60, run);
    // Первый ещё выполняется: второй получает 409, операция не запускается
    await expect(runIdempotent(kv, 'k', 60, run)).rejects.toMatchObject({ code: 'CONFLICT' });
    gate.resolve(42);
    expect(await first).toEqual({ value: 42, replayed: false });
    // Первый закончился: повтор отдаёт сохранённый результат
    expect(await runIdempotent(kv, 'k', 60, run)).toEqual({ value: 42, replayed: true });
    expect(runs).toBe(1);
  });

  it('ошибка операции освобождает ключ — повтор выполняет её заново', async () => {
    const kv = new MemoryKeyValueStore();
    await expect(
      runIdempotent(kv, 'k', 60, async () => {
        throw new Error('сбой');
      }),
    ).rejects.toThrow('сбой');
    expect(await runIdempotent(kv, 'k', 60, async () => 'ok')).toEqual({
      value: 'ok',
      replayed: false,
    });
  });

  it('разные ключи не мешают друг другу', async () => {
    const kv = new MemoryKeyValueStore();
    const [a, b] = await Promise.all([
      runIdempotent(kv, 'a', 60, async () => 1),
      runIdempotent(kv, 'b', 60, async () => 2),
    ]);
    expect([a.value, b.value]).toEqual([1, 2]);
  });
});
