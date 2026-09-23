# 10. Владение файлами (anti-conflict)

> Актуальная машиночитаемая карта — `OWNERS.yaml` в корне (проверяется `pnpm ownership:check`); подробный разбор conflict-sensitive зон с «что можно самому / что через владельца / что стабильно» — `AGENT_GUIDE.md` §18; зоны workstream'ов — `12-workstreams.md`. Фактические пути после foundation: контракты лежат в `packages/contracts/src/{common,entities,blocks,routes,fixtures}`, фронтовые shared-зоны — `apps/web/src/shared/{api,auth,max,i18n,lib,store}`.

Правило №1: у каждой папки из списка ровно один владелец на итерацию. Остальные агенты **не редактируют** эти файлы — оставляют запрос владельцу (комментарий в задаче/PR) или создают файл в своей зоне и просят промоушен.

Правило №2: конфликт `pnpm-lock.yaml` решается только `pnpm install`, никогда руками. Добавление зависимости в свой `package.json` разрешено; в корневой — только core.

Правило №3: CI (`scripts/check-ownership.ts` по `OWNERS.yaml`) падает, если один PR трогает зоны двух владельцев без метки `cross-owner`.

## 10.1. Владелец «core» (архитектор)

| Путь | Почему |
|---|---|
| `docs/**` | Source of truth. ADR — сквозная нумерация через архитектора |
| `CLAUDE.md`, `README.md`, `OWNERS.yaml` | Правила для агентов |
| `package.json` (корень), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `packages/config/**` | Ломает сборку всем |
| `.github/workflows/**`, `infra/**`, `.env.example`, `scripts/**` | CI/инфра |

## 10.2. Владелец «contracts»

| Путь | Правило |
|---|---|
| `packages/contracts/src/{index,enums,errors,events,permissions}.ts`, `packages/contracts/src/common/**` | Только владелец contracts. Это точка синхронизации ≥3 модулей |
| `packages/contracts/src/fixtures/**` | Только владелец contracts: моки и seed должны совпадать |
| `packages/contracts/src/blocks/**`, `packages/contracts/src/entities/**` | Владелец B4 |
| `packages/contracts/src/routes/<domain>.ts` | Владелец — BE-агент домена (таблица ниже). Любое изменение формы ответа → уведомить FE-потребителей |

| Файл контракта | BE-владелец | FE-потребители |
|---|---|---|
| `auth.ts` | B1 | F6, W3, W4 |
| `dashboards.ts` | B6 | W1, W3, W5, W7 |
| `catalog.ts` | B2 | W4, W6 |
| `groups.ts` | B2 | W1, W5, W8 |
| `attendance.ts` | B3 | W8 |
| `courses.ts`, `blocks/` | B4 | W2, W10 |
| `assignments.ts` | B5 | W2, W9 |
| `ai.ts` | B10 (секции A1/A2/A4 — их агенты) | W3, W4 |
| `family.ts`, `payments.ts` | B8 | W5, W6 |
| `files.ts` | B7 | W2, W10 |
| `course-builder.ts` | A5 (скелет — F4) | W10 |
| `notifications.ts`, `support.ts` | B9 | W3, W11 |

Правило изменения контракта: BE-владелец меняет файл → в описании PR перечисляет FE-задачи, которые затронуты → они обновляют моки/экраны в своей зоне.

## 10.3. Владелец «db»

| Путь | Правило |
|---|---|
| `packages/db/prisma/schema/base.prisma` (datasource, generator, общие enum'ы, `User`, `AuditLog`) | Только владелец db |
| `packages/db/prisma/schema/<module>.prisma` | Владелец — BE-агент модуля, но **только добавление** полей/индексов. Переименования/удаления — через владельца db |
| `packages/db/prisma/migrations/**` | Только владелец db. Миграции создаются **сериализованно**: агент меняет схему → владелец db генерирует и коммитит миграцию. Две миграции параллельно — никогда |
| `packages/db/src/seed/index.ts` | Владелец db; модульные фрагменты `seed/<module>.ts` — агенты модулей (данные берут из `contracts/fixtures`) |

## 10.4. Владелец «api-shell»

`apps/api/src/{main,worker,app.module}.ts`, `apps/api/src/common/**`, `apps/api/src/config/**`, `apps/api/test/setup*`.

- Регистрация модуля в `app.module.ts` — единственная правка, которую владелец делает по запросу (одна строка).
- Новое общее (guard, pipe, helper) — запрос владельцу; до этого агент держит helper в своём модуле.

`apps/api/src/modules/<name>/**` — владелец: агент задачи B-модуля. Один модуль — один агент. Подпапки `modules/ai/{onboarding,tutor,insights,trajectory}` — агенты A1–A4; `modules/ai/*` верхнего уровня — B10.

## 10.5. Владелец «web-shell»

`apps/web/src/app/**` (роутер, shells, bottom-nav config, providers), `apps/web/src/shared/api/{client,query-keys,sse}.ts`, `apps/web/src/shared/api/mocks/handlers/index.ts`, `apps/web/src/shared/max-bridge/**`, `apps/web/src/shared/i18n/index.ts`, `apps/web/src/shared/lib/**`, `apps/web/vite.config.ts`.

Механизмы, чтобы FE-агенты не трогали shell:
- **Роуты**: фича экспортирует `pages/<role>/<feature>/routes.tsx` (`RouteObject[]`); владелец shell подключает одной строкой в `router.tsx`.
- **MSW**: агент пишет `mocks/handlers/<domain>.ts`; владелец добавляет в `handlers/index.ts`.
- **Query-keys**: общий файл содержит только префиксы; ключи сущностей — в `entities/<x>/keys.ts`.
- **i18n**: `shared/i18n/<ns>.ru.json` — по namespace на фичу, владелец — агент фичи; `index.ts` подхватывает по glob.
- **Меню**: пункты BottomNav — в `app/bottom-nav.config.ts` у владельца; агент просит добавить.

`apps/web/src/{pages,widgets,features,entities}/<x>/**` — владелец: FE-агент задачи W-* по таблице в `09-tasks.md`. Пересечения разведены подпапками: `entities/course/**` — W2, `entities/course/editors/**` — W10; `entities/club` — W4 (W6 использует, не правит).

Режим репетитора (docs/07 F16–F18) разложен по workstream'ам из `12-workstreams.md`:
- E — `pages/teacher/{home,groups,settings,profile,more}/**`, `widgets/teacher-{home,group}-*/**`;
- F — `pages/teacher/{students,performance}/**`, `widgets/teacher-{student,performance}-*/**`;
- I — `pages/teacher/wallet/**`, `features/withdraw-wallet/**`;
- D — общий виджет `widgets/homework-performance/**` (статусы заданий, сетка, карточка задания): его используют родитель и преподаватель.

Префиксы виджетов не пересекаются: у каждого `widgets/teacher-*` один владелец (E — главная и группы, F — ученик и успеваемость). Пути экранов преподавателя, на которые ссылаются страницы разных фич, и состояние навигации «открыт из приложения» — в `shared/lib/{teacher-paths,navigation}.ts` (web-shell): страницы не импортируют модули друг друга.

## 10.6. Владельцы «ui» и «ai»

- `packages/ui/**` — владелец ui (F7). Новые компоненты — запрос; временно компонент живёт в `apps/web/src/shared/ui/` у автора запроса.
- `packages/ai/src/{client,provider,fake-provider,json}.ts`, `prompts/registry.ts`, `context/**` — владелец ai (F8).
- `packages/ai/src/prompts/<feature>.ts` — владелец соответствующей A-задачи.

## 10.7. `OWNERS.yaml` (формат)

```yaml
owners:
  core:      [docs/**, CLAUDE.md, README.md, OWNERS.yaml, package.json, pnpm-*.yaml, turbo.json, tsconfig.base.json, packages/config/**, .github/**, infra/**, scripts/**, .env.example]
  contracts: [packages/contracts/src/index.ts, packages/contracts/src/common.ts, packages/contracts/src/enums.ts, packages/contracts/src/errors.ts, packages/contracts/src/events.ts, packages/contracts/src/fixtures/**]
  db:        [packages/db/prisma/schema/base.prisma, packages/db/prisma/migrations/**, packages/db/src/seed/index.ts, packages/db/src/client.ts]
  api-shell: [apps/api/src/main.ts, apps/api/src/worker.ts, apps/api/src/app.module.ts, apps/api/src/common/**, apps/api/src/config/**]
  web-shell: [apps/web/src/app/**, apps/web/src/shared/api/client.ts, apps/web/src/shared/api/query-keys.ts, apps/web/src/shared/api/sse.ts, apps/web/src/shared/api/mocks/handlers/index.ts, apps/web/src/shared/max-bridge/**, apps/web/src/shared/i18n/index.ts, apps/web/src/shared/lib/**, apps/web/vite.config.ts]
  ui:        [packages/ui/**]
  ai:        [packages/ai/src/client/**, packages/ai/src/provider.ts, packages/ai/src/fake-provider.ts, packages/ai/src/json.ts, packages/ai/src/prompts/registry.ts, packages/ai/src/context/**]
  B1: [apps/api/src/modules/identity/**, apps/api/src/modules/school/**, packages/contracts/src/auth.ts, packages/db/prisma/schema/identity.prisma, packages/db/prisma/schema/school.prisma]
  # ... по одной записи на каждую задачу из 09-tasks.md
```
