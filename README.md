# Мини-приложение дополнительного образования в MAX

Приложение для кружков и дополнительных занятий в школах: ученик, родитель и преподаватель работают с общими данными внутри мессенджера MAX; интеллектуальный слой — GigaChat. Сейчас репозиторий содержит **foundation**: каркас, контракты, БД, auth, права, интеграционные порты и dev-моки. Продуктовые модули реализуются отдельными агентами (`docs/12-workstreams.md`).

Документация — `docs/` (source of truth), для агентов — `docs/AGENT_GUIDE.md`, что построено — `docs/FOUNDATION.md`.

## Стек

TypeScript, pnpm workspaces + Turborepo · **web:** React 19, Vite 7, react-router 7, TanStack Query 5, zustand, MSW, i18next · **api:** NestJS 11, ts-rest, zod, pino · **db:** PostgreSQL 16+ (локально — embedded PostgreSQL 18), Prisma 6 · **ai:** GigaChat за портом (`@edu/ai`) · **ui:** собственная дизайн-система на обычном CSS (`@edu/ui`) · тесты: Vitest, Testing Library, Supertest.

## Структура

```
apps/web            React мини-приложение (роли: student / parent / teacher)
apps/api            NestJS: HTTP (main.ts) + worker (worker.ts)
packages/contracts  zod + ts-rest контракты, enum'ы, события, permissions, фикстуры
packages/db         Prisma multi-file schema, миграции, seed, embedded PostgreSQL
packages/ai         AiProvider порт: mock + GigaChat, retry/timeout/json, промпты
packages/ui         Компоненты, токены, тема, playground
packages/config     Общие ESLint-конфиги
docs/               Архитектура, ADR, гайд для агентов
infra/              docker-compose (если есть Docker)
scripts/            Утилиты: check-ownership, ensure-env
```

## Быстрый старт

Требования: Node ≥ 22, pnpm 10 (`npm i -g pnpm`). Docker не нужен.

```bash
pnpm setup
```

`setup` = создать `.env` из `.env.example` → `pnpm install` → поднять локальный PostgreSQL → применить миграции → засеять демо-мир. Затем:

```bash
pnpm dev
```

Поднимает пакеты в watch-режиме, api на http://localhost:3000/api/v1 и web на http://localhost:5173. Открой web, выбери демо-пользователя (ученик / родитель / преподаватель) на экране входа. Песочница UI-компонентов — http://localhost:5173/dev/ui. Проверка api: http://localhost:3000/api/v1/health.

Только фронт без бэка: в `.env` поставь `VITE_API_MODE=mock` (MSW-моки на фикстурах).

## Команды (из корня)

| Команда | Что делает |
|---|---|
| `pnpm dev` / `pnpm dev:web` / `pnpm dev:api` / `pnpm dev:worker` | Всё / только web / только api / worker (нужен при `QUEUE_DRIVER=bullmq`) |
| `pnpm build` | Сборка всех пакетов и приложений |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Проверки во всех пакетах |
| `pnpm check` | lint + typecheck + test + build |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm ownership:check` | Изменения не пересекают зоны разных владельцев (`OWNERS.yaml`) |
| `pnpm env:init` | Создать `.env` из шаблона |
| `pnpm db:up` / `pnpm db:down` | Запустить / остановить локальный PostgreSQL (данные в `.data/pg`) |
| `pnpm db:migrate` | Создать и применить миграцию (`prisma migrate dev`, нужен терминал) |
| `pnpm db:deploy` | Применить миграции (CI/prod) |
| `pnpm db:generate` | Сгенерировать Prisma-клиент |
| `pnpm db:seed` | Засеять демо-мир (идемпотентно) |
| `pnpm db:reset` | Сбросить БД, применить миграции, засеять |
| `pnpm db:studio` | Prisma Studio |

## Переменные окружения

Все — в корневом `.env` (шаблон и описание каждой переменной — `.env.example`). Ключевые переключатели:

| Переменная | Значения | По умолчанию |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_TEST` | строка подключения | локальный embedded PostgreSQL, базы `edu` / `edu_test` |
| `AUTH_PROVIDER` | `dev` / `max` | `dev` — вход по `POST /auth/dev` |
| `AI_PROVIDER` | `mock` / `gigachat` | `mock` (mock отвечает детерминированно по каждому промпту) |
| `QUEUE_DRIVER` | `inline` / `bullmq` (+ `REDIS_URL`) | `inline` |
| `STORAGE_DRIVER` | `local` / `s3` | `local` (`.data/storage`) |
| `PAYMENT_PROVIDER` | `fake` / `yookassa` | `fake` |
| `VITE_API_MODE` | `real` / `mock` | `real` |
| `VITE_MAX_MODE` | `mock` / `real` | `mock` |
| `VITE_AUTH_MODE` | `dev` / `max` | `dev` |

Api не стартует при невалидном окружении и печатает список проблемных переменных.

## ИИ-функции (GigaChat через `@edu/ai`)

- **Конструктор курса** (`/teacher/course-builder`): по теме/практике без конспекта или из файлов (pdf, docx, txt, md) →
  атомы знаний → узлы с проверяемыми цитатами → уроки с тестами, пропусками и практикой → ревью → курс. Схема — `docs/13-course-pipeline.md`.
- **Онбординг ученика** (`/onboarding`): диалог с ИИ, черновик профиля, подбор кружков школы, зачисление.
- **ИИ-тьютор** (`/student/tutor`): SSE-чат с учётом расписания, заданий, посещаемости и прогресса; лимит `AI_TUTOR_DAILY_LIMIT`.
- **Моя траектория** (`/student/profile`): строится job'ом по данным ученика, обновляется после онбординга и по кнопке (раз в сутки).

Реальный GigaChat: `AI_PROVIDER=gigachat` + `GIGACHAT_AUTH_KEY`; без ключа всё работает на mock-провайдере.
Сертификат НУЦ Минцифры (`GIGACHAT_CA_CERT_PATH`, pem с root + sub CA) нужен, если системные CA не доверяют
`*.devices.sberbank.ru`. Персональный тариф принимает один запрос за раз — `GIGACHAT_MAX_CONCURRENCY=1`
(по умолчанию), на B2B можно поднять. Модель по умолчанию `GigaChat-2` (lite); для качества конспектов и уроков —
`GIGACHAT_MODEL=GigaChat-2-Pro`.

## База данных

Локально используется embedded PostgreSQL без Docker (`packages/db/scripts/pg.mjs`). С Docker: `docker compose -f infra/docker-compose.yml up -d` (Postgres, Redis, MinIO) и те же `DATABASE_URL`.

Схема — `packages/db/prisma/schema/*.prisma` (по файлу на модуль). Миграции — `packages/db/prisma/migrations`. Новая миграция: измени схему → `pnpm --filter @edu/db migrate:dev --name <name>` → `pnpm db:generate`. Без интерактивного терминала — см. `docs/AGENT_GUIDE.md` §16.

Seed создаёт школу, 4 демо-пользователей (`max-student-1`, `max-student-2`, `max-parent-1`, `max-teacher-1`), кружки, группы, занятия, курс, задания, платёж. Данные лежат в `packages/contracts/src/fixtures` и используются также MSW-моками.

## Тесты

`pnpm test` — все пакеты. Тесты, которым нужна БД (`packages/db`, интеграционные в `apps/api`), используют `DATABASE_URL_TEST` (база `edu_test`, создаётся `pnpm db:up`) и пропускаются при `SKIP_DB_TESTS=1`.

## Production

`APP_ENV=production` требует: `AUTH_PROVIDER=max` (+ `MAX_APP_SECRET`), нестандартный `JWT_SECRET`, явный `CORS_ORIGINS`, `QUEUE_DRIVER=bullmq` с Redis, `STORAGE_DRIVER=s3`. Процессы: `apps/api` (`node dist/main.js`), worker (`node dist/worker.js`), статика `apps/web/dist`. Миграции — `pnpm db:deploy` до раскатки api.
