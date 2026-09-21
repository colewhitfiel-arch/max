# AGENT_GUIDE — как работать в этом репозитории

Читается каждым coding-агентом перед задачей. Коротко, конкретно, с путями. Если что-то здесь противоречит коду — прав документ через владельца docs, а не «как удобнее».

## 1. Где source of truth

| Что | Где |
|---|---|
| Продукт | `docs/00-product-spec.md` |
| Архитектура и решения | `docs/02-architecture.md`, `docs/adr/*` (ADR-001…013) |
| Что реально построено в foundation | `docs/FOUNDATION.md` |
| Модель данных | `docs/04-data-model.md` → `packages/db/prisma/schema/*.prisma` |
| API | `docs/05-api-contracts.md` → `packages/contracts/src/routes/*.ts` (код первичен для форм, документ — для смысла) |
| Зависимости модулей, публичные сервисы | `docs/08-dependencies.md` |
| Задачи и workstreams | `docs/12-workstreams.md` (актуально), `docs/09-tasks.md` (исходный план) |
| Владение файлами | `docs/10-ownership.md`, `OWNERS.yaml`, раздел 18 ниже |
| Пользовательские сценарии | `docs/07-user-flows.md` |

## 2. Архитектурные правила (нарушать нельзя)

1. **Контракт первичен.** Любая ручка сначала описывается в `packages/contracts/src/routes/<domain>.ts` (zod + ts-rest), потом реализуется в api и потребляется в web. Дублировать DTO в приложениях запрещено.
2. **Модуль читает только свои таблицы.** Чужие данные — через публичный сервис чужого модуля (DI) или доменные события. Репозиторий чужого модуля импортировать нельзя (ESLint это ловит).
3. **Зависимости только вниз по слоям** (`docs/08`): identity/school/files → catalog/groups/family → attendance/courses/assignments/payments → analytics/notifications/ai → course-builder.
4. **Формулы аналитики — только в `modules/analytics`.** Ни один другой модуль и ни один экран не считает проценты.
5. **Внешние системы только за портами:** `AuthProvider`, `AiProvider`/`AiService`, `StorageProvider`, `JobQueue`, `KeyValueStore`, `PaymentProvider` (появится в workstream I). В тестах — mock/fake реализации.
6. **Единый формат ошибок** (`ADR-013`): бросай `Errors.*` из `apps/api/src/common/errors`, не `HttpException`. Фронт получает `ApiClientError`.
7. **Frontend:** `app → pages → widgets → features → entities → shared → @edu/ui, @edu/contracts`. Только вниз. Никаких визуальных стилей вне `packages/ui` (`ADR-011`).
8. **Никаких прямых `fetch`/`axios`** во фронте — только `shared/api/client.ts` через хуки `entities/<x>/api.ts`.
9. **Секреты только через env** (`apps/api/src/config/env.ts`). В логи не попадают токены, ключи, тексты сообщений ИИ.
10. **Тесты защищают foundation:** не ломай существующие; для нового модуля — интеграционный тест на его контракт.

## 3. Frontend feature boundaries

```
apps/web/src
  app/        роутер, shells ролей, providers, bottom-nav — владелец web-shell
  pages/<role>/<feature>/   routes.tsx + ui/*Page.tsx     — владелец фичи
  widgets/    крупные композиции из entities/features       — владелец фичи, которая их создала
  features/   действия пользователя (mutation + форма)       — владелец фичи
  entities/<x>/  api.ts (хуки Query), keys.ts, ui/, model.ts — владелец по таблице в docs/12
  shared/     api, auth, max, i18n, lib, store, config       — владелец web-shell
```

Правила:
- Страница фичи импортирует только свои `widgets/features/entities` и `shared`. Другая роль — чужая зона.
- `entities/<x>` не импортирует `entities/<y>`; композиция — в `widgets`.
- Данные: `useQuery`/`useMutation` в `entities/<x>/api.ts` поверх `api` (ts-rest клиент) и `unwrap()`. Ключи — префикс из `shared/api/query-keys.ts` + локальный `keys.ts`.
- Состояния экрана обязательны: loading (`Skeleton`), error (`ErrorState`; для `NOT_FOUND`/`NOT_IMPLEMENTED` — «раздел в разработке»), empty (`EmptyState`), ready.
- Тексты — через i18n (`shared/i18n/<ns>.ru.json`, namespace на фичу).
- Права: `useHasPermission('teacher:attendance.mark')`, `<Can permission=...>`, route-guards `RequireAuth/RequireRole/RequirePermission`.

## 4. Backend modules

```
apps/api/src
  main.ts / worker.ts / app.module.ts / bootstrap.ts   — владелец api-shell
  config/env.ts                                        — владелец api-shell
  common/{auth,errors,events,kv,logger,pagination,prisma,queue,time,validation}  — владелец api-shell
  modules/index.ts                                     — реестр модулей (одна строка на модуль)
  modules/<name>/
    <name>.module.ts      Nest-модуль, exports: публичный сервис
    <name>.controller.ts  @TsRestHandler(contract) → сервис; @Public/@Roles/@RequirePermission
    <name>.service.ts     логика + публичный API модуля
    <name>.repository.ts  Prisma, только свои таблицы
    <name>.policies.ts    ресурсные проверки (своя ли группа, привязан ли ребёнок)
    <name>.events.ts      подписки @OnDomainEvent / публикация через DomainEventBus
    <name>.jobs.ts        JobQueue.process(...) в onModuleInit
```

Готовые примеры: `modules/identity` (полный модуль), `modules/health` (минимальный контроллер), `modules/family`, `modules/school` (публичные сервисы без контроллеров).

## 5. Куда добавлять новую frontend-фичу

1. Убедись, что ручки есть в контракте; если нет — сначала `packages/contracts` (см. п. 7).
2. Хуки данных — `apps/web/src/entities/<сущность>/api.ts` (если сущность новая — создай папку по образцу `entities/session`).
3. Страницы — `apps/web/src/pages/<role>/<feature>/ui/*.tsx`, роуты — `pages/<role>/<feature>/routes.tsx` (экспорт `RouteObject[]`).
4. Действия (формы/мутации) — `features/<action>/`.
5. Моки — `shared/api/mocks/handlers/<domain>.ts` (данные из `@edu/contracts/fixtures`), схемы контракта для валидации ответа.
6. Пункт меню — попроси владельца web-shell добавить в `app/bottom-nav.config.ts`; подключение `routes.tsx` в `app/router.tsx` — тоже он (одна строка).
7. Тексты — `shared/i18n/<feature>.ru.json`.

## 6. Куда добавлять новый backend-домен

1. Схема: `packages/db/prisma/schema/<module>.prisma` (только добавление) → миграцию делает владелец db (п. 16).
2. Контракт: `packages/contracts/src/routes/<domain>.ts` + подключение в `routes/index.ts` и `apiContract` (`src/index.ts`) — если файл новый, попроси владельца contracts.
3. Модуль: `apps/api/src/modules/<name>/` по структуре из п. 4.
4. Регистрация: одна строка в `apps/api/src/modules/index.ts` (владелец api-shell).
5. Seed-фрагмент: `packages/db/src/seed/<module>.ts`, подключение в `seed/index.ts` — владелец db.
6. Тесты: `apps/api/test/<module>/*.test.ts` через `createTestApp()` (реальная тестовая БД + seed) или `createMiniApp()` (без БД).

## 7. Shared types

`packages/contracts/src/`:
- `enums.ts` — все enum'ы + словари (`ROLE_LABELS`, `CLUB_CATEGORY_LABELS`, `BLOCK_TYPE_META`).
- `entities/*.ts` — сущности как они ходят по API (`User`, `StudentProfile`, `Group`, `Lesson`=`ScheduleEvent`, `Course`, `CourseModule`, `CourseBlock`, `Assignment`, `Submission`, `Attendance`, `CourseProgress`=`StudentProgress`, `Trajectory`=`LearningTrajectory`, `Payment`, `AiConversation`, `AiMessage`, …).
- `blocks/` — содержимое блоков курса по типу.
- `common/` — `IdSchema`, `DateTimeSchema`, `MoneySchema`, пагинация.
- `routes/*.ts` — DTO запросов/ответов и роуты; `routes/streaming.ts` — SSE.
- `events.ts` — доменные события; `permissions.ts` — права; `errors.ts` — коды; `fixtures/` — демо-мир.

Импорт: `import { AuthResultSchema, type MeDto } from '@edu/contracts'`; фикстуры — `@edu/contracts/fixtures`. После правки контракта — `pnpm --filter @edu/contracts build` (или `pnpm build`), потребители берут `dist`.

## 8. Shared UI

`packages/ui` (`@edu/ui`): компоненты, иконки, `applyTheme`, `tokens`; стили — `@edu/ui/styles.css`; песочница — `@edu/ui/playground` (в web на `/dev/ui`). Список компонентов и правила — `packages/ui/README.md`. Нужен новый компонент — запрос владельцу ui; до тех пор держи его в `apps/web/src/shared/ui/`.

## 9. Database models

`packages/db/prisma/schema/*.prisma` (multi-file): `base.prisma` (datasource, generator, enum'ы, `User`, `AuditLog`) + файл на модуль. Клиент генерируется в `packages/db/generated/client` (`pnpm db:generate`), экспортируется из `@edu/db`. В api — `PrismaService` (`apps/api/src/common/prisma`). Соглашения: id `uuid(7)` `@db.Uuid`, `timestamptz`, `@map` snake_case, `@@map` для таблиц.

## 10. Как работать с API

- Сервер: `@TsRestHandler(xxxContract.route)` + `tsRestHandler(route, async ({ body, params, query }) => ({ status: 200, body }))`. Валидацию делает ts-rest; ошибки — `throw Errors.notFound('Группа')`.
- Клиент: `api.groups.getTeacherGroup({ params: { groupId } })` → `unwrap(result)` → типизированное тело или `ApiClientError`.
- Пагинация: `PaginationQuerySchema` + `toPage()` (`apps/api/src/common/pagination/cursor.ts`).
- SSE: путь и схемы в `contracts/routes/streaming.ts`; сервер — обычный контроллер с `ZodValidationPipe`; клиент — `shared/api/sse.ts`.
- Заголовок `X-Request-Id` есть в каждом ответе — указывай его в багрепортах.

## 11. Authentication

- Бэк: `apps/api/src/common/auth`. `AuthGuard` (глобальный) проверяет Bearer JWT и кладёт `AuthUser { userId, maxUserId, roles, activeRole, profileId }` в запрос; `@CurrentUser()` его отдаёт; `@Public()` отключает проверку. Провайдер (`AUTH_PROVIDER=dev|max`) только подтверждает личность; сессии выдаёт `modules/identity`.
- Dev-вход: `POST /api/v1/auth/dev { maxUserId, roles }` — создаёт пользователя/роли/профили при необходимости. Демо-пользователи: `max-student-1`, `max-student-2`, `max-parent-1`, `max-teacher-1` (он же родитель). Любой другой id — новый пользователь.
- Фронт: `shared/auth/store.ts` (zustand), `useAuth()`, `useMe()`, `useActiveRole()`; экран `/auth` (dev: выбор демо-пользователя), `/auth/role` (добавить/выбрать роль). Токены — в `MaxBridge.storage`. Refresh по 401 делает клиент автоматически.
- Production через MAX: `MaxAuthProvider` (`apps/api/src/common/auth/providers/max-auth.provider.ts`) — схема подписи помечена как «сверить с dev.max.ru» (workstream J).

## 12. Permissions

Источник — `packages/contracts/src/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`, `hasPermission`). Бэк: `@Roles('TEACHER')` или `@RequirePermission('teacher:attendance.mark')` на методе контроллера (проверяет `AccessGuard`). Ресурсный доступ — в `*.policies.ts` (`assertTeacherOwnsGroup`, `FamilyService.assertParentLinked`). Фронт: `useHasPermission`, `<Can>`, `RequirePermission`. Новое право: добавь в `PERMISSIONS` и в `ROLE_PERMISSIONS` (владелец contracts), затем используй с обеих сторон.

## 13. MAX integration

`apps/web/src/shared/max/`: интерфейс `MaxBridge` (launch-параметры, пользователь, тема, viewport, lifecycle, `openLink`, `haptic`, `storage`, события). `VITE_MAX_MODE=mock` — `MockMaxBridge` (браузер), `real` — `MaxSdkBridge` (каркас, SDK не подключён: `TODO(max-sdk)`). Хуки: `useMaxBridge()`, `useMaxTheme()`. Фичи не обращаются к SDK напрямую. Бэк-часть — `MaxAuthProvider`. Подключение реального SDK и проверка подписи — workstream J.

## 14. GigaChat

Пакет `@edu/ai`: `AiService` (chat, stream, embed, chatJson), `MockAiProvider`, `GigaChatProvider`, `PromptRegistry`/`definePrompt`, `serializeStudentContext`. В api `AiService` доступен через DI (`AiModule`, глобальный). Промпты — `packages/ai/src/prompts/<feature>.ts` с версией (`id@version`) и zod-схемой ответа; в результаты пишется `promptId`. Не вызывай GigaChat напрямую и не логируй тексты сообщений. `AI_PROVIDER=mock` по умолчанию; real — workstream K.

## 15. Storage

`apps/api/src/modules/files/storage`: порт `StorageProvider` (`@Inject(STORAGE)`), `LocalFsStorage` (dev: `.data/storage`, подписанные ссылки `/files/local/:token`), `S3Storage` (заглушка `NOT_IMPLEMENTED`). Ключи — `buildStorageKey(purpose, fileId, fileName)`. Сущность `File` в Prisma. Контракт — `contracts/routes/files.ts`. Реализация ручек upload/confirm/get и S3 — workstream G.

## 16. Migrations

1. Измени `packages/db/prisma/schema/<module>.prisma` (только добавление полей/индексов; переименования — через владельца db).
2. Обнови `docs/04-data-model.md`.
3. Миграцию создаёт владелец db: `pnpm --filter @edu/db migrate:dev --name <snake_case_name>` (нужен интерактивный терминал и запущенная БД). Без TTY: `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema --script > prisma/migrations/<timestamp>_<name>/migration.sql`, затем `pnpm db:deploy`.
4. `pnpm db:generate` → `pnpm --filter @edu/db build` → typecheck потребителей.
5. Никогда две миграции параллельно; не редактируй применённые миграции.

## 17. Проверки перед завершением задачи

Из корня:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Плюс: `pnpm format` (prettier), `pnpm ownership:check` (нет чужих зон), приложение стартует (`pnpm dev`), для FE — экран работает в `VITE_API_MODE=mock` и `real`, для BE — интеграционный тест на контракт. В описании PR: какие контракты изменены и какие FE-задачи затронуты.

## 18. Файлы с одним владельцем (conflict-sensitive)

Как читать: **Почему** конфликтуют → **Сам** (что можно менять без координации) → **Координация** (что требует владельца) → **Стабильно** (публичные интерфейсы, которые нельзя ломать).

### Root configuration (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.npmrc`, `packages/config/**`, `.github/**`, `infra/**`, `scripts/**`) — владелец core
- Почему: одно изменение ломает сборку/линт всем; turbo-графы и tsconfig наследуются везде.
- Сам: ничего.
- Координация: новые turbo-таски, глобальные правила ESLint, версии TS/ESLint, CI.
- Стабильно: имена скриптов корня (`dev`, `build`, `lint`, `typecheck`, `test`, `db:*`), `tsconfig.base.json` опции strict.

### Dependency manifests (`pnpm-lock.yaml`, `*/package.json`)
- Почему: параллельные `pnpm install` дают конфликтующие lock-файлы.
- Сам: добавить зависимость в `package.json` **своего** пакета/приложения и запустить `pnpm install`; конфликт lock — только `pnpm install`, не руками.
- Координация: зависимости корня; смена мажорных версий общих библиотек (react, nest, prisma, zod, ts-rest); `pnpm.onlyBuiltDependencies`.
- Стабильно: имена пакетов `@edu/*` и их `exports`.

### Database schema (`packages/db/prisma/schema/**`) — базовый файл: db; модульные файлы: агент модуля
- Почему: одна БД, единая цепочка миграций; переименование поля ломает чужие запросы.
- Сам: добавить поле/индекс/модель в **свой** `<module>.prisma`; seed-фрагмент `seed/<module>.ts`.
- Координация: `base.prisma` (enum'ы, `User`, `AuditLog`), переименования/удаления, связи в чужие модели, `seed/index.ts`.
- Стабильно: имена таблиц/колонок уже применённых миграций; enum'ы (синхронны с contracts).

### Migrations (`packages/db/prisma/migrations/**`) — владелец db
- Почему: линейная история; две миграции с одной базой ломают `migrate deploy`.
- Сам: ничего.
- Координация: любая миграция — сериализованно, через владельца db (п. 16).
- Стабильно: применённые миграции не редактируются.

### Shared types и API contracts (`packages/contracts/src/**`)
- Почему: их потребляют все; изменение формы ответа ломает фронт и моки.
- Сам: **добавлять** опциональные поля и новые роуты в файле своего домена (`routes/<domain>.ts`); новые DTO в этом же файле.
- Координация: `index.ts`, `common/**`, `enums.ts`, `errors.ts`, `events.ts`, `permissions.ts`, `fixtures/**`, `blocks/**` (B4), удаление/переименование полей, изменение статусов ответов, новый файл домена.
- Стабильно: пути и методы существующих роутов, имена ключей роутов (`authContract.getMe`), формат `ApiError`, значения enum'ов, `API_PREFIX`.

### Auth core (`apps/api/src/common/auth/**`, `apps/api/src/modules/identity/**`) — владелец api-shell
- Почему: от него зависят все guards и все сессии; ошибка = дыра в безопасности.
- Сам: использовать `@CurrentUser()`, `@Roles`, `@RequirePermission`, `IdentityService.buildAuthUser`.
- Координация: формат JWT-claims, провайдеры, guards, выдача токенов, `AuthUser`.
- Стабильно: `AuthUser` поля, декораторы, `AUTH_PROVIDER` токен и интерфейс `AuthProvider`, ручки `/auth/*`.

### Permissions (`packages/contracts/src/permissions.ts`, `apps/api/src/common/auth/access.guard.ts`, `apps/web/src/shared/auth/**`) — contracts / api-shell / web-shell
- Почему: единая матрица прав для двух сторон.
- Сам: проверять права существующими хуками/декораторами.
- Координация: новые permissions и их раздача ролям; изменение guards.
- Стабильно: строки permissions (они в коде фич), `ROLE_PERMISSIONS` только расширяется.

### Root routing и shells (`apps/web/src/app/**`) — владелец web-shell
- Почему: один роутер, один набор shells; правки двух фич в `router.tsx` конфликтуют строчно.
- Сам: `pages/<role>/<feature>/routes.tsx`, страницы, `entities`, `features`, `widgets` своей фичи.
- Координация: подключение `routes.tsx` в `router.tsx`, пункты `bottom-nav.config.ts`, providers, shells, `RootRedirect`.
- Стабильно: URL-схема `/student|/parent|/teacher/...`, контракт `routes.tsx` (`RouteObject[]`), хуки `shared/auth`, `shared/api`, `shared/max`.

### Shared UI public API (`packages/ui/src/index.ts` и пропсы компонентов) — владелец ui
- Почему: пропсы используются во всех фичах; переименование пропа ломает десятки файлов.
- Сам: использовать компоненты; предлагать новые через запрос.
- Координация: новые компоненты, изменение пропсов, токены.
- Стабильно: имена и пропсы экспортированных компонентов (расширять можно, ломать нельзя), имена CSS-переменных `--ui-*`, `applyTheme`.

### Environment configuration (`.env.example`, `apps/api/src/config/env.ts`, `apps/web/src/shared/config.ts`) — core / api-shell / web-shell
- Почему: невалидный env валит старт всем; переменные документируются в одном месте.
- Сам: ничего.
- Координация: любая новая переменная — сразу в `.env.example` + схему `env.ts` (+ `ci.yml`, если обязательна).
- Стабильно: имена существующих переменных и их семантика.

### Прочие single-owner: `apps/api/src/modules/index.ts` (реестр модулей), `apps/api/src/common/**`, `apps/web/src/shared/api/mocks/handlers/index.ts`, `apps/web/src/shared/i18n/index.ts`, `docs/**`, `OWNERS.yaml`, `CLAUDE.md`.
