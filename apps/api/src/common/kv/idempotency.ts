import { Errors } from '../errors/app-error';
import type { KeyValueStore } from './key-value-store';

/**
 * Сколько держится маркер «запрос выполняется». Не меньше самого долгого запроса (функция
 * Vercel и прокси nginx обрываются на 300 с), чтобы параллельный повтор не прошёл; при падении
 * процесса посреди запроса ключ освобождается сам — не через сутки.
 */
const PENDING_TTL_SEC = 300;

type Entry<T> = { idempotency: 'pending' } | { idempotency: 'done'; value: T };

export interface IdempotentResult<T> {
  value: T;
  /** `true` — результат из хранилища (повтор), операция сейчас не выполнялась. */
  replayed: boolean;
}

/**
 * Выполнение по `Idempotency-Key` (docs/05 §5.1). Ключ сначала атомарно занимается маркером
 * «выполняется» (`setIfAbsent`), потом выполняется `run`, результат хранится `ttlSec`. Повтор с тем
 * же ключом отдаёт сохранённый результат; пока первый запрос не закончился — 409 CONFLICT
 * (раньше проверка «get → операция → set» пропускала оба параллельных запроса). Ошибка `run`
 * освобождает ключ: повтор выполнит операцию заново.
 */
export async function runIdempotent<T>(
  kv: KeyValueStore,
  key: string,
  ttlSec: number,
  run: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const claimed = await kv.setIfAbsent<Entry<T>>(key, { idempotency: 'pending' }, PENDING_TTL_SEC);
  if (!claimed) {
    const stored = await kv.get<Entry<T>>(key);
    if (stored?.idempotency === 'done') return { value: stored.value, replayed: true };
    throw Errors.conflict('Такой же запрос ещё выполняется — подождите несколько секунд');
  }
  let value: T;
  try {
    value = await run();
  } catch (error) {
    await kv.del(key).catch(() => undefined);
    throw error;
  }
  await kv.set<Entry<T>>(key, { idempotency: 'done', value }, ttlSec);
  return { value, replayed: false };
}
