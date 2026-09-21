# ADR-012. Локальная разработка без Docker: embedded PostgreSQL, inline-очередь, локальное хранилище

**Статус:** accepted, 2026-09-21

## Контекст
На машинах разработки может не быть Docker (как на машине, где создавался foundation). Docs/02 предполагали docker-compose с Postgres, Redis и MinIO. Foundation должен запускаться локально одной командой.

## Решение
Каждая инфраструктурная зависимость имеет dev-реализацию без внешних сервисов, выбираемую через env:

| Зависимость | Dev без Docker | С Docker / prod | Переключатель |
|---|---|---|---|
| PostgreSQL | `pnpm db:up` — бинарники `embedded-postgres` (PostgreSQL 18), данные в `.data/pg`, сервер живёт как отдельный процесс (`pg_ctl`), `pnpm db:down` останавливает | `infra/docker-compose.yml` или управляемая БД | `DATABASE_URL` |
| Очереди (BullMQ/Redis) | `InlineJobQueue` — задачи выполняются в процессе api асинхронно | `BullMqJobQueue` + worker-процесс | `QUEUE_DRIVER=inline\|bullmq`, `REDIS_URL` |
| Key-value (кэш, идемпотентность, rate-limit) | `MemoryKeyValueStore` | Redis (адаптер добавляется позже за тем же портом) | — |
| Файлы (S3) | `LocalFsStorage` — диск `.data/storage`, загрузка/скачивание через подписанные ссылки api `/files/local/:token` | `S3Storage` (заглушка, реализуется отдельно) | `STORAGE_DRIVER=local\|s3` |
| GigaChat | `MockAiProvider` | `GigaChatProvider` | `AI_PROVIDER=mock\|gigachat` |
| Платежи | `FakePaymentProvider` | ЮKassa | `PAYMENT_PROVIDER=fake\|yookassa` |
| MAX auth | `DevAuthProvider` (`POST /auth/dev`) | `MaxAuthProvider` | `AUTH_PROVIDER=dev\|max` |

Prisma остаётся единственным способом работы с БД; embedded-postgres — это тот же PostgreSQL, миграции и seed одинаковы для всех окружений.

## Последствия
- `pnpm setup && pnpm dev` работает на чистой машине без Docker.
- Inline-очередь не переживает рестарт процесса и не масштабируется — только для dev/test. В `APP_ENV=production` ожидается `bullmq`.
- Порты остаются единственной точкой замены: модули зависят от `JobQueue`, `KeyValueStore`, `StorageProvider`, `AiProvider`, `AuthProvider`, а не от реализаций.
