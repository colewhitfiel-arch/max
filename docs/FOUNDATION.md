# FOUNDATION — что построено и как это устроено

Состояние на 2026-09-21. Foundation = техническая основа, поверх которой отдельные агенты реализуют продуктовые модули (`docs/12-workstreams.md`). Продуктовых фич здесь нет; есть каркас, контракты, БД, auth, права, интеграционные порты, dev-моки и проверки.

## 1. Архитектура foundation

```
apps/web  (React SPA, Vite)  ──HTTP JSON / SSE──▶  apps/api (NestJS, HTTP)  ──▶ PostgreSQL (Prisma)
   │ @edu/ui, @edu/contracts                          │ @edu/contracts, @edu/db, @edu/ai
   │ MaxBridge (mock | sdk)                            │ AuthProvider (dev | max)
   │ MSW-моки (VITE_API_MODE=mock)                     │ JobQueue (inline | bullmq) — worker.ts
                                                       │ StorageProvider (local | s3)
                                                       │ AiService (mock | gigachat)
```

Пакеты: `packages/contracts` (типы + ts-rest), `packages/db` (Prisma), `packages/ai` (LLM-порт), `packages/ui` (дизайн-система), `packages/config` (ESLint). Всё — TypeScript, pnpm workspaces + Turborepo (ADR-001…013).

Один backend-код, два процесса: `main.ts` (HTTP) и `worker.ts` (фоновые задачи). В dev worker не нужен (`QUEUE_DRIVER=inline`).

## 2. Module boundaries

- Backend: модуль = папка `apps/api/src/modules/<name>` со своими таблицами, сервисом, контроллером, policies. Чужие данные — только через публичные сервисы (`docs/08 §8.3`) и доменные события (`DomainEventBus`, схемы в `contracts/events.ts`). ESLint запрещает импорт чужих репозиториев.
- Frontend: `app → pages → widgets → features → entities → shared` (ESLint `no-restricted-imports`), страницы разделены по ролям.
- Реализовано в foundation: `health`, `identity` (auth, роли, профили, сессии), `school` и `family` (минимальные публичные сервисы), `ai` (провайдер), `files/storage` (порт), `course-builder/pipeline` (порты). Остальные модули — папки не созданы, создаются workstream'ами.

## 3. Frontend (`apps/web`)

- Роутинг (`react-router` 7, lazy-страницы): `/` → `RootRedirect` по статусу auth/роли; `/auth` (dev-вход / MAX-вход), `/auth/role`, `/auth/switch`, `/onboarding`; `/student/{home,tutor,tutor/:id,courses,courses/:id,blocks/:id,assignments,assignments/:id,settings,profile}`; `/parent/{home,children,analytics,courses,courses/teacher/:id,payments,settings}`; `/teacher/{home,groups,groups/:id,students/:id,courses,courses/:id,course-builder,assignments,more}`; `/notifications`, `/admin` (заглушка 501), `/dev/ui` (песочница UI, только dev), `/403`, `*`.
- Композиции без стилей над `@edu/ui` — `shared/ui/{AsyncState,ScreenHeader,SectionTitle}`; `widgets/{account-section,stats-tiles,club-progress-list,ai-text-card}`; `features/{dev-login,switch-role,link-child,mark-notification-read}`.
- MSW-моки: `shared/api/mocks/state.ts` — изменяемый демо-мир (сессии, роли, привязки, прогресс, сдачи, уведомления, диалоги) поверх фикстур; 11 доменных хендлеров, ответы валидируются схемами контракта; незамоканные пути под `/api/v1/*` → 501. Тест `mocks/handlers.test.ts` гоняет реальный клиент через msw/node; `app/app.smoke.test.tsx` — полное приложение в jsdom (вход учеником, переходы, смена роли преподаватель → родитель: сердца детей, кошелёк, «Выполненные задания», пополнение).
- Shells ролей (`app/shells`) = `AppLayout` + `BottomNavigation` + `Outlet`, обёрнуты в `RequireAuth` + `RequireRole`. Меню — `app/bottom-nav.config.ts`.
- Страницы всех зон созданы как placeholder'ы с реальными состояниями (loading / error / empty / ready) на хуках `entities/*/api.ts`. В `VITE_API_MODE=mock` все страницы работают на фикстурах через MSW; в `real` — работают ручки foundation, остальные показывают «раздел в разработке».
- Данные: единый клиент `shared/api/client.ts` (`@ts-rest/core` `initClient` + кастомный fetch: Authorization, X-Request-Id, авто-refresh по 401, нормализация в `ApiClientError`), TanStack Query (`shared/api/query-client.ts`), SSE (`shared/api/sse.ts`).
- Состояние: zustand — `shared/auth/store.ts` (сессия), `shared/store/ui-store.ts` (тема, выбранный ребёнок). Серверное состояние — только в Query.
- i18n: `shared/i18n` (ru, заготовка en), namespace на фичу.
- MAX: `shared/max` (см. §11).

## 4. Backend (`apps/api`)

- `config/env.ts` — zod-схема окружения, читает корневой `.env`, валит старт с понятным списком ошибок; `EnvModule` + `@InjectEnv()`.
- `common/auth` — `AuthProvider` порт (`DevAuthProvider`, `MaxAuthProvider`), `JwtService` (HS256 на node:crypto, refresh-токены хэшируются), глобальные `AuthGuard` и `AccessGuard`, декораторы `@Public`, `@Roles`, `@RequirePermission`, `@CurrentUser`.
- `common/errors` — `AppError`/`Errors.*`, `ApiExceptionFilter` (единый формат, маппинг Zod/ts-rest/HttpException/Prisma).
- `common/logger` — pino, request-id (AsyncLocalStorage, заголовок `X-Request-Id`), redaction секретов и контента ИИ, интерсептор HTTP-логов.
- `common/events` — `DomainEventBus.emit(name, payload)` с валидацией, `@OnDomainEvent`.
- `common/queue` — `JobQueue` порт, `InlineJobQueue`, `BullMqJobQueue`, `QueueModule.forRoot('api'|'worker')`.
- `common/kv` — `KeyValueStore` порт, `MemoryKeyValueStore`.
- `common/prisma` — `PrismaService` (глобальный), `ping()`.
- `common/pagination`, `common/time`, `common/validation`.
- `modules/index.ts` — реестр модулей (`DOMAIN_MODULES`), `app.module.ts` собирает всё, `bootstrap.ts` — префикс `/api/v1`, CORS, middleware.
- ts-rest: `@TsRestHandler(contract)` в контроллерах, `TsRestModule` глобально (`validateResponses` вне production).

## 5. Database (`packages/db`)

- PostgreSQL, Prisma 6.19, multi-file schema `prisma/schema/*.prisma` — 16 файлов по модулям, 30+ моделей, все enum'ы 1:1 с contracts. Соглашения: `uuid(7)`, `timestamptz`, snake_case через `@map`.
- Миграция `20260921000000_init` (создана `prisma migrate diff`, применяется `migrate deploy`).
- Клиент генерируется в `generated/client` (`pnpm db:generate`), экспорт `@edu/db` (`PrismaClient`, `Prisma`, типы, `createPrismaClient`), `@edu/db/testing` (`prepareTestDatabase`).
- Seed (`src/seed/*.ts`) идемпотентен, строится из `@edu/contracts/fixtures`: школа, 4 пользователя (преподаватель = родитель, 2 ученика, родитель), 2 кружка, 2 группы, 3 зачисления, расписание, 5 занятий относительно «сегодня», посещаемость, курс с 4 блоками (TEXT/VIDEO/QUIZ/HOMEWORK), 3 задания, 1 сдача, прогресс, диалог с ИИ, платёж, уведомление.
- Локальная БД без Docker: `scripts/pg.mjs` (embedded PostgreSQL 18, данные в `.data/pg`, базы `edu` и `edu_test`).

## 6. Shared types (`packages/contracts`)

Enum'ы, сущности (`entities/`), схемы блоков (`blocks/`), примитивы (`common/`), 83 роута в 15 доменных контрактах (`routes/`), SSE-описания (`routes/streaming.ts`), события, permissions, коды ошибок, фикстуры. Собирается tsup в ESM+CJS с типами для обоих; потребители читают `dist` (после `pnpm build`). Снапшот-тест роутов защищает пути от случайных изменений.

## 7. Shared UI (`packages/ui`)

35+ компонентов (каркас, формы, списки, индикаторы, диалоги, тосты, навигация, layout, типографика), 16 иконок, `tokens.css` + `tokens.ts`, `applyTheme` (light/dark/system), `UiPlayground`. Обычный CSS, классы `ui-*`, варианты через `data-*` (ADR-011). Поставляется исходниками (Vite компилирует напрямую). Тесты — только поведение и a11y.

## 8. Auth

Поток: клиент → `POST /auth/dev` (dev) или `POST /auth/max` (production) → `IdentityService` upsert'ит пользователя, роли, профили → выдаёт access JWT (15 мин; claims `sub, mid, roles, role, pid`) и refresh (30 дней, хранится sha256 + activeRole) → все ручки требуют Bearer (кроме `@Public`). `POST /auth/refresh` ротирует пару, `POST /auth/switch-role`/`/auth/roles` — смена/добавление роли (TEACHER — по `School.inviteCode`, в dev допускается без кода), `GET /me` — `MeDto`. Dev-переключение между пользователями и ролями — экран `/auth` в web и `POST /auth/dev` в api.

## 9. Permissions

`contracts/permissions.ts`: 33 permission-строки, матрица `ROLE_PERMISSIONS`, `hasPermission`. Бэк — `AccessGuard` по `@Roles`/`@RequirePermission`; ресурсные проверки — policies модулей (`FamilyService.assertParentLinked` как образец). Фронт — хуки и guards в `shared/auth`. Каждый роут контракта несёт `metadata: { auth, roles?, permission? }` — это документация и источник для guard'ов/тестов.

## 10. API conventions

`/api/v1`, JSON, UTC ISO-даты, деньги в копейках, cursor-пагинация, единый `ApiError` с `X-Request-Id`, идемпотентность через заголовок `Idempotency-Key` (описан в контракте; проверка на сервере — при реализации сдач/платежей). Подробно — `docs/05` §5.1 и ADR-013.

## 11. MAX adapter

`apps/web/src/shared/max`: интерфейс `MaxBridge`, `MockMaxBridge` (браузер), `MaxSdkBridge` (каркас, SDK не подключён). `apps/api/src/common/auth/providers/max-auth.provider.ts` — проверка подписи launch-параметров по схеме «HMAC-SHA256 от секрета приложения» — **допущение**, сверить с dev.max.ru.

## 12. AI provider

`packages/ai`: `AiProvider` порт, `MockAiProvider`, `GigaChatProvider` (OAuth с кэшем токена, chat/stream/embeddings, ретраи с backoff и `Retry-After`, таймауты, CA-сертификат через undici), `AiService` (requestId, метрики длительности, безопасные логи), `chatJson` (валидация zod + повтор с текстом ошибки), `PromptRegistry`, `serializeStudentContext`. В api — `AiModule` (глобальный), `AiService` через DI. 100 тестов без сети.

## 13. Storage abstraction

`StorageProvider` порт + `LocalFsStorage` (dev, подписанные ссылки через api) + `S3Storage` (заглушка). Порты пайплайна курса: `ContentExtractor`, `CourseTransformer`, `CoursePipeline` (`modules/course-builder/pipeline`), сущности `File` и `CourseGenerationJob` в БД, enum `GenerationStage`.

## 14. Configuration

Один корневой `.env` (шаблон `.env.example`, `pnpm env:init`). Переменные сгруппированы: общее, backend, БД, очереди, auth, MAX, GigaChat, storage, платежи, frontend (`VITE_*`). Обязательность зависит от выбранных драйверов (например, `REDIS_URL` при `QUEUE_DRIVER=bullmq`); в `APP_ENV=production` запрещены dev-секрет, dev-вход и пустой CORS. Vite читает корневой `.env` (`envDir`).

## 15. Logging

pino (JSON в prod, pretty в dev), уровень из `LOG_LEVEL`. Каждая запись содержит `requestId` и `userId` (из AsyncLocalStorage). Redaction: `authorization`, `*.token`, `*.accessToken`, `*.refreshToken`, `*.authKey`, `*.secret`, `*.launchParams`, `*.messages`, `*.content`. Ошибки API логирует фильтр (5xx — с stack), HTTP-запросы — интерсептор (`/health` — debug). Фоновые задачи логируют ошибки с `queue/name/jobId/attempt`. `@edu/ai` логирует только размеры, promptId, длительность, коды ошибок.

## 16. Testing

- `packages/contracts`: снапшот роутов, дубли, metadata, sanity схем (11).
- `packages/ui`: поведение/a11y ключевых компонентов (19).
- `packages/ai`: retry/timeout/json/mock/gigachat с мок-fetch/registry/context (100).
- `packages/db`: подключение, применённость миграций (3, нужна БД).
- `apps/api`: env, JWT, guards (public/roles/permission), формат ошибок, очередь/kv/курсор/время, провайдеры auth, AiService(mock), LocalFsStorage, интеграция health+auth через реальную тестовую БД с seed (46).
- `apps/web`: клиент API, guards, auth-store, MockMaxBridge, RootRedirect.
- Запуск: `pnpm test` (turbo); БД-тесты пропускаются при `SKIP_DB_TESTS=1`.

## 17. Dependency direction

```
apps/web ──▶ @edu/ui, @edu/contracts
apps/api ──▶ @edu/contracts, @edu/db, @edu/ai
@edu/db  ──▶ @edu/contracts (только fixtures/enums для seed)
@edu/ai, @edu/ui, @edu/contracts ──▶ ничего из монорепо
```
Внутри api — слои из `docs/08`; внутри web — `app → pages → widgets → features → entities → shared`.

## 18. Временные части (будут заменены)

| Часть | Статус | Кто заменяет |
|---|---|---|
| Placeholder-страницы web | временные, только состояния и структура | workstreams A–I |
| Дизайн-токены и внешний вид `@edu/ui` | технические плейсхолдеры | отдельный дизайн-этап, внутри `packages/ui` |
| Иконки `@edu/ui/icons` | заглушки | дизайн-этап |
| `DevAuthProvider`, экран `/auth` dev | только dev, запрещён в production | остаётся для dev |
| `MockMaxBridge`, `MaxSdkBridge` (каркас), схема подписи в `MaxAuthProvider` | mock / допущение | workstream J |
| `MockAiProvider` с `productMockRules`, промпты онбординга/тьютора/траектории/course-builder | mock отвечает по каждому промпту детерминированно | workstream K (реальный GigaChat) |
| `InlineJobQueue`, `MemoryKeyValueStore` | dev-реализации | production: bullmq + Redis (I4) |
| `LocalFsStorage`, `S3Storage`-заглушка | dev / stub | workstream G |
| Извлечение текста (txt/md/pdf/docx) и пайплайн course-builder | реализовано (docs/13); pptx/OCR — нет | workstream G |
| `FakePaymentProvider` (ещё не создан) | — | workstream I |
| MSW-моки | dev-инструмент | остаются, обновляются вместе с контрактами |

## 19. Известные ограничения

- `packages/contracts/dist/index.d.ts` ≈ 4 МБ из-за zod-типов с общими ответами — typecheck потребителей медленнее на секунды; при росте контракта рассмотреть `isolatedDeclarations`/разбиение entry.
- `prisma migrate dev` требует интерактивный терминал; без TTY используйте `migrate diff` + `migrate deploy` (описано в AGENT_GUIDE §16).
- В api отключено правило `consistent-type-imports` (Nest DI по метаданным конструктора).
- Inline-очередь не переживает рестарт; для production обязателен bullmq.
- Схема подписи MAX и детали GigaChat API — допущения, отмечены `TODO` в коде.
