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
pnpm run setup
```

Именно `pnpm run setup`: `pnpm setup` — встроенная команда самого pnpm (настраивает `PNPM_HOME`), скрипт репозитория она не запускает.

`setup` = создать `.env` из `.env.example` → `pnpm install` → поднять локальный PostgreSQL → применить миграции (`pnpm db:deploy`) → засеять демо-мир. Затем:

```bash
pnpm dev
```

Поднимает пакеты в watch-режиме, api на http://localhost:3000/api/v1 и web на http://localhost:5173. Открой web, выбери демо-пользователя (ученик / родитель / преподаватель) на экране входа. Песочница UI-компонентов — http://localhost:5173/dev/ui. Проверка api: http://localhost:3000/api/v1/health.

Моков в приложении нет: web всегда ходит в api по `VITE_API_URL`, данные — из базы (`pnpm db:seed`). Контрактный фейковый сервер на MSW остался только в тестах (`apps/web/src/test/fake-api`).

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
| `AI_PROVIDER` | `mock` / `gigachat` | `mock` (детерминированные ответы; в production запрещён) |
| `QUEUE_DRIVER` | `inline` / `bullmq` (+ `REDIS_URL`) | `inline` |
| `STORAGE_DRIVER` | `local` / `s3` | `local` (`.data/storage`) |
| `PAYMENT_PROVIDER` | `fake` / `yookassa` | `fake` (платёж закрывается сразу; в production запрещён) |
| `VITE_MAX_MODE` | `mock` / `real` | `mock` |
| `VITE_AUTH_MODE` | `dev` / `max` | `dev` |

Api не стартует при невалидном окружении и печатает список проблемных переменных. При `APP_ENV=production` дополнительно запрещены dev-секрет JWT, dev-вход, пустой `CORS_ORIGINS` и заглушки `AI_PROVIDER=mock` / `PAYMENT_PROVIDER=fake`.

## ИИ-функции (GigaChat через `@edu/ai`)

- **Конструктор курса** (`/teacher/course-builder`): по теме/практике без конспекта или из файлов (pdf, docx, txt, md) →
  атомы знаний → узлы с проверяемыми цитатами → уроки с тестами, пропусками и практикой → ревью → курс. Схема — `docs/13-course-pipeline.md`.
- **Онбординг ученика** (`/onboarding`): диалог с ИИ-тьютором, черновик профиля, подбор кружков школы: «записаться»
  или «попробовать позже». Выбор фиксируется как спрос (записался / хочет позже / пропустил), диалог знакомства
  продолжается как чат с тьютором. Преподаватель видит спрос на `/teacher/clubs/demand`.
- **ИИ-тьютор** (`/student/tutor`): SSE-чат с учётом расписания, заданий, посещаемости и прогресса; лимит `AI_TUTOR_DAILY_LIMIT`.
- **Моя траектория** (`/student/profile`): строится job'ом по данным ученика, обновляется после онбординга и по кнопке (раз в сутки).

Реальный GigaChat: `AI_PROVIDER=gigachat` + `GIGACHAT_AUTH_KEY`; без ключа всё работает на mock-провайдере.
Сертификат НУЦ Минцифры (`GIGACHAT_CA_CERT_PATH`, pem с root + sub CA) нужен, если системные CA не доверяют
`*.devices.sberbank.ru`. Персональный тариф принимает один запрос за раз — `GIGACHAT_MAX_CONCURRENCY=1`
(по умолчанию), на B2B можно поднять. Модель по умолчанию `GigaChat-2` (lite); для качества конспектов и уроков —
`GIGACHAT_MODEL=GigaChat-2-Pro`.

## База данных

Локально используется embedded PostgreSQL без Docker (`packages/db/scripts/pg.mjs`). С Docker: `docker compose -f infra/docker-compose.yml up -d` (Postgres, Redis, MinIO) и те же `DATABASE_URL`.

Схема — `packages/db/prisma/schema/*.prisma` (по файлу на модуль). Миграции — `packages/db/prisma/schema/migrations` (Prisma ищет их рядом со схемой). Новая миграция: измени схему → `pnpm --filter @edu/db migrate:dev --name <name>` → `pnpm db:generate`. Без интерактивного терминала — см. `docs/AGENT_GUIDE.md` §16.

Seed создаёт школу, 4 демо-пользователей (`max-student-1`, `max-student-2`, `max-parent-1`, `max-teacher-1`), кружки, группы, занятия, курс, задания, платёж. Данные лежат в `packages/contracts/src/fixtures` и используются также MSW-моками.

## Тесты

`pnpm test` — все пакеты. Тесты, которым нужна БД (`packages/db`, интеграционные в `apps/api`), используют `DATABASE_URL_TEST` (база `edu_test`, создаётся `pnpm db:up`) и пропускаются при `SKIP_DB_TESTS=1`.

## Запуск в Docker (одна команда)

```bash
cp .env.example .env     # если файла ещё нет
docker compose up -d --build
```

Приложение — на <http://localhost:8080>. Это **один origin**: nginx отдаёт статику и проксирует
`/api/` в контейнер api (мини-приложение MAX иначе не подключить). Миграции применяются
автоматически при старте api. Нужен Docker Compose ≥ 2.24 с BuildKit.

| Сервис | Что | Порт наружу |
|---|---|---|
| `web` | nginx: SPA + прокси `/api/` | 8080 |
| `api` | NestJS + inline-очередь | нет (только внутри сети) |
| `postgres` | PostgreSQL 16, том `pg-data` | нет |

Остановить — `docker compose down`, вместе с данными — `docker compose down -v`,
логи — `docker compose logs -f api`. Файлы `Dockerfile`, `compose.yaml`, `infra/nginx.conf`.
`infra/docker-compose.yml` — это отдельная dev-инфраструктура, она не связана с `compose.yaml`.

## Мини-приложение MAX

Приложение упаковано как мини-апп мессенджера MAX (dev.max.ru/docs/webapps):

- В `index.html` подключён SDK `https://st.max.ru/js/max-web-app.js`, он даёт глобальный `WebApp`.
  Адаптер — `apps/web/src/shared/max/sdk-bridge.ts`: launch-параметры, `start_param` диплинка,
  системная кнопка «назад», haptic, `openLink`/`openMaxLink`, `DeviceStorage`. Вне MAX мост не падает,
  а работает как обычный веб: показывается вход, хранилище — localStorage.
- Вход по подписи: `WebApp.initData` уходит в `POST /auth/max`, сервер проверяет HMAC-SHA256
  (`secret_key = HMAC("WebAppData", токен бота)`) — `apps/api/src/common/auth/providers/max-auth.provider.ts`.

Как подключить:

1. Разверните приложение по **https** (см. «Хостинг» ниже) — URL до 1024 символов, без пробелов.
2. В настройках бота MAX (бизнес-платформа → Чаты → бот → ⋮ → Настройки) вставьте URL и выберите
   тип кнопки (Открыть / Запустить / Играть).
3. В `.env` задайте `AUTH_PROVIDER=max` и `MAX_BOT_TOKEN=<токен бота>`, пересоберите:
   `docker compose up -d --build`. Режим входа по умолчанию — `VITE_AUTH_MODE=auto`: внутри MAX
   вход по подписи, в обычном браузере — экран демо-пользователей, так что один адрес годится
   и для мессенджера, и для показа.
4. Диплинк с параметром: `https://max.ru/<botName>?startapp=<payload>` (латиница, цифры, `_`, `-`,
   до 512 символов) — значение приходит в `bridge.getStartParam()`.
5. Задайте `MAX_BOT_NAME=<botName>` (имя из ссылки `max.ru/<botName>`, без `@`): тогда ссылка-приглашение
   ребёнка — диплинк `https://max.ru/<botName>?startapp=invite_<токен>`, и она открывается прямо в
   мини-приложении (при старте оно само переходит на экран приглашения). Без `MAX_BOT_NAME` ссылка ведёт
   на `WEB_URL/invite/<токен>` и внутри MAX откроется в браузере, где входа через MAX нет. В браузере
   запуск по диплинку эмулирует `?startapp=invite_<токен>`.

Без токена бота приложение работает в dev-режиме входа (`VITE_AUTH_MODE=dev`): экран выбора
демо-пользователя, подпись MAX не проверяется.

## Хостинг

Нужен один https-домен, за которым стоит `compose.yaml`. Минимум — сервер с Docker, доменом и
TLS (caddy/nginx/traefik перед портом 8080) либо любой PaaS, умеющий compose.

Для **временного** адреса (демо, проверка мини-аппа в MAX) хватит туннеля к локальному стенду:

```bash
docker compose up -d --build
ssh -R 80:127.0.0.1:8080 nokey@localhost.run    # выдаст https://<...>.lhr.life
```

Перед публичным запуском в `.env`: `APP_ENV=production`, `AUTH_PROVIDER=max`, `MAX_BOT_TOKEN`,
свой `JWT_SECRET` (≥ 32 символов), `PUBLIC_ORIGIN=https://<домен>`, `AI_PROVIDER=gigachat`
с `GIGACHAT_AUTH_KEY`, явный `CORS_ORIGINS`, `PAYMENT_PROVIDER=yookassa` (+ ключи магазина). При
`APP_ENV=production` api не стартует с dev-входом, дефолтным секретом и заглушками `mock`/`fake`.
Миграции — `pnpm db:deploy` до раскатки api.
Для горизонтального масштабирования — `QUEUE_DRIVER=bullmq` с Redis (ADR-012; отдельный процесс
`node dist/worker.js`, рецепт в комментарии `compose.yaml`). `STORAGE_DRIVER=s3` валидацией env не
проверяется и пока не готов: `S3Storage` — заглушка, рабочий драйвер — `local`.
