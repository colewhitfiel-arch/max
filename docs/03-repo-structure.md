# 3. Структура репозитория

Актуализировано после foundation (2026-09-21), дерево сверено с кодом 2026-09-23. Отличия от первоначального плана: контракты разложены по `common/`, `entities/`, `blocks/`, `routes/`; `packages/config` содержит только ESLint; в `packages/db` появился `scripts/pg.mjs` (embedded PostgreSQL); в web shared-зоны `auth/`, `max/`, `store/`.

```
max/
├── CLAUDE.md                     # правила для агентов (короткие), ссылки на AGENT_GUIDE
├── README.md                     # как запустить
├── OWNERS.yaml                   # карта владельцев папок (pnpm ownership:check)
├── docs/                         # source of truth: архитектура, ADR, FOUNDATION, AGENT_GUIDE, workstreams
├── package.json                  # scripts: setup, dev, build, lint, typecheck, test, db:*, format, ownership:check
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json · eslint.config.js · .prettierrc · .npmrc
├── .env.example                  # единственный шаблон окружения для всех приложений
├── .github/workflows/ci.yml
├── infra/docker-compose.yml      # postgres, redis, minio — только если есть Docker
├── scripts/                      # check-ownership.mjs, ensure-env.mjs
├── apps/
│   ├── web/                      # React мини-приложение (@edu/web)
│   │   ├── index.html · vite.config.ts · vitest.config.ts · eslint.config.js · tsconfig.json
│   │   ├── public/mockServiceWorker.js   # MSW (VITE_API_MODE=mock)
│   │   └── src/
│   │       ├── app/              # main.tsx, App.tsx, providers.tsx, router.tsx, bottom-nav.config.ts,
│   │       │                     # shells/{Student,Parent,Teacher}Shell.tsx, error-boundary, splash
│   │       ├── pages/
│   │       │   ├── auth/ · onboarding/ · notifications/ · invite/ · not-found/ · forbidden/ · admin/
│   │       │   ├── student/{home,tutor,courses,assignments,settings,profile}/
│   │       │   ├── parent/{home,children,analytics,courses,payments,settings,profile,tutor,wallet}/
│   │       │   └── teacher/{home,groups,students,courses,course-builder,assignments,more,
│   │       │                club-demand,performance,profile,settings,wallet}/
│   │       │       └── <feature>/{routes.tsx, ui/*Page.tsx}      # attendance/ появится в workstream H
│   │       ├── widgets/          # композиции экранов: foundation (account-section, stats-tiles, club-progress-list,
│   │       │                     # ai-text-card) + workstream'ы (student-home-*, student-profile-hero, parent-home-*,
│   │       │                     # teacher-home-*, teacher-student-*, teacher-performance-*, homework-*, trajectory, …)
│   │       ├── features/         # dev-login, switch-role, link-child, mark-notification-read, change-avatar,
│   │       │                     # generate-course, upload-file, withdraw-wallet
│   │       ├── entities/<x>/     # session, lesson, assignment, course, student, club, group, dashboard,
│   │       │                     # payment, notification, ai, file, generation — api.ts (хуки Query), keys.ts, ui/
│   │       └── shared/
│   │           ├── api/          # client.ts, errors.ts, query-keys.ts, query-client.ts, sse.ts,
│   │           │                 # mocks/{lib,state,demo,browser}.ts + handlers/*.ts
│   │           ├── auth/         # store.ts, hooks.ts, guards.tsx, role-routes.ts
│   │           ├── max/          # types.ts, mock-bridge.ts, sdk-bridge.ts, index.tsx (provider, hooks)
│   │           ├── store/        # ui-store.ts (тема, выбранный ребёнок)
│   │           ├── i18n/         # index.ts, <ns>.ru.json, <ns>.en.json
│   │           ├── lib/          # dates.ts, money.ts, format.ts, lazy-route.ts, navigation.ts, teacher-paths.ts
│   │           ├── ui/           # AsyncState, ScreenHeader, SectionTitle — композиции над @edu/ui без стилей
│   │           └── config.ts     # VITE_* переменные
│   └── api/                      # NestJS (@edu/api): HTTP + worker
│       ├── nest-cli.json · tsconfig.json · tsconfig.build.json · vitest.config.ts · eslint.config.mjs
│       ├── src/
│       │   ├── main.ts           # HTTP-процесс
│       │   ├── worker.ts         # процесс фоновых задач (те же модули)
│       │   ├── app.module.ts     # сборка: core-модули + DOMAIN_MODULES
│       │   ├── bootstrap.ts      # префикс /api/v1, CORS, request-id, логгер
│       │   ├── config/           # env.ts (zod-схема), env.module.ts (@InjectEnv)
│       │   ├── types/            # ambient-декларации (pdf-parse-lib.d.ts)
│       │   ├── common/           # auth/, errors/, events/, kv/, logger/, pagination/, prisma/, queue/, time/, validation/
│       │   └── modules/
│       │       ├── index.ts      # DOMAIN_MODULES — реестр (одна строка на модуль)
│       │       ├── health/       # GET /health, /health/live
│       │       ├── identity/     # auth.controller, identity.service/repository, роли, профили, сессии
│       │       ├── school/       # публичный сервис (inviteCode, settings, tz)
│       │       ├── family/       # публичный сервис (дети, assertParentLinked)
│       │       ├── ai/           # ai.module (AiService через DI), ai.factory
│       │       ├── files/storage/        # StorageProvider порт, LocalFsStorage, S3Storage (stub)
│       │       ├── course-builder/pipeline/  # порты ContentExtractor, CourseTransformer, CoursePipeline + stubs
│       │       ├── catalog/ · groups/ · courses/ · analytics/   # созданы workstream'ами D, E, B, A
│       │       └── (schedule, attendance, assignments, payments, notifications, support —
│       │            создаются workstream'ами)
│       └── test/                 # helpers/{env,mini-app,test-app}.ts, foundation/*.test.ts, integration/*.test.ts
├── packages/
│   ├── contracts/                # @edu/contracts — единственный источник типов API (tsup → dist esm+cjs)
│   │   └── src/
│   │       ├── index.ts          # реэкспорт + apiContract + API_PREFIX
│   │       ├── enums.ts · errors.ts · events.ts · permissions.ts
│   │       ├── common/           # primitives.ts (Id, даты, Money, Period), pagination.ts
│   │       ├── entities/         # user, profiles, school, club, group, lesson, course, assignment,
│   │       │                     # analytics, ai, payment, file, notification, family
│   │       ├── blocks/           # схемы content по BlockType
│   │       ├── routes/           # meta.ts + 15 доменных контрактов + streaming.ts + routes.test.ts
│   │       └── fixtures/         # демо-мир (seed + MSW)
│   ├── db/                       # @edu/db — Prisma (tsc → dist cjs)
│   │   ├── prisma/schema/        # base.prisma + 15 файлов по модулям
│   │   │   └── migrations/       # 20260921130803_init, 20260921180000_course_builder_topic_knowledge,
│   │   │                         # 20260922085338_onboarding_club_interests (Prisma берёт <папка схемы>/migrations)
│   │   ├── scripts/pg.mjs        # embedded PostgreSQL: up | down | status
│   │   ├── generated/client/     # prisma generate (gitignored)
│   │   └── src/                  # index.ts, client.ts, testing.ts, seed/{index,identity,catalog-groups,learning,ai-payments-notifications}.ts
│   ├── ai/                       # @edu/ai — AiProvider, MockAiProvider, GigaChatProvider, AiService, retry/timeout/json,
│   │   └── src/                  # prompts/registry.ts, context/student-context.ts, providers/{mock,gigachat}/
│   ├── ui/                       # @edu/ui — компоненты (src/components/*), icons/, styles/{tokens,base,index}.css,
│   │   └── src/                  # tokens.ts, theme.ts, playground/, lib/
│   └── config/                   # @edu/config — eslint/{base,node,react}.js
└── .data/                        # локальные данные (pg, storage, логи) — gitignored
```

## Конвенции именования
- Папки и файлы — kebab-case; типы/классы — PascalCase; enum-значения — UPPER_SNAKE.
- Prisma: модели PascalCase, колонки snake_case через `@map`, таблицы `@@map("snake_case")`.
- Контракт: `<domain>Contract` (ts-rest `c.router`), схемы `XxxSchema`/`XxxDtoSchema`/`XxxBodySchema`/`XxxQuerySchema`, тип — то же имя без `Schema`.
- Nest: `XxxModule`, `XxxController`, `XxxService`, `XxxRepository`, `XxxPolicies`, `XxxJobs`.
- Очереди BullMQ: `analytics`, `ai`, `course-builder`, `notifications`, `schedule`.
- Ветки: `feat/<workstream>-<slug>` (например `feat/H-attendance`), коммиты — Conventional Commits на английском.
- ESLint-конфиги в CommonJS-пакетах (api, db) называются `eslint.config.mjs`.
