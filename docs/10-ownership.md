# 10. Владение файлами (anti-conflict)

> Актуальная машиночитаемая карта — `OWNERS.yaml` в корне (проверяется `pnpm ownership:check`); подробный разбор conflict-sensitive зон с «что можно самому / что через владельца / что стабильно» — `AGENT_GUIDE.md` §18; зоны workstream'ов — `12-workstreams.md`. Фактические пути после foundation: контракты лежат в `packages/contracts/src/{common,entities,blocks,routes,fixtures}`, фронтовые shared-зоны — `apps/web/src/shared/{api,auth,max,i18n,lib,store}`.

Правило №1: у каждой папки из списка ровно один владелец на итерацию. Остальные агенты **не редактируют** эти файлы — оставляют запрос владельцу (комментарий в задаче/PR) или создают файл в своей зоне и просят промоушен.

Правило №2: конфликт `pnpm-lock.yaml` решается только `pnpm install`, никогда руками. Добавление зависимости в свой `package.json` разрешено; в корневой — только core.

Правило №3: `pnpm ownership:check` (`scripts/check-ownership.mjs` по `OWNERS.yaml`, в CI — на каждый push и PR) падает, если коммит трогает зоны двух владельцев без метки `cross-owner` в своём сообщении. Коммиты идут прямо в `main`, поэтому проверяется каждый коммит диапазона отдельно (merge-коммиты пропускаются). У файла один владелец — зона с самым конкретным глобом: вложенные зоны (`packages/ai/**` ⊃ `packages/ai/src/prompts/**`) пересечением не считаются. Локально без аргументов скрипт проверяет незапушенные коммиты (`origin/main..HEAD`) и предупреждает о незакоммиченных правках; `--staged` — staged-файлы (метку подтверждает флаг `--cross-owner`).

## 10.1. Владелец «core» (архитектор)

| Путь | Почему |
|---|---|
| `docs/**` | Source of truth. ADR — сквозная нумерация через архитектора |
| `CLAUDE.md`, `README.md`, `OWNERS.yaml` | Правила для агентов |
| `package.json` (корень), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `packages/config/**` | Ломает сборку всем |
| `.github/workflows/**`, `infra/**`, `.env.example`, `scripts/**` | CI/инфра |
| `.editorconfig`, `.gitattributes`, `.gitignore`, `.prettierignore`, `.claude/**` | Корневые конфиги инструментов |

## 10.2. Владелец «contracts»

| Путь | Правило |
|---|---|
| `packages/contracts/src/{index,enums,errors,events,permissions}.ts`, `packages/contracts/src/common/**` | Только владелец contracts. Это точка синхронизации ≥3 модулей |
| `packages/contracts/src/fixtures/**` | Только владелец contracts: моки и seed должны совпадать |
| `packages/contracts/src/entities/**`, `packages/contracts/src/routes/{index,meta}.ts`, `routes/routes.test.ts`, конфиги пакета (`packages/contracts/*`) | Владелец contracts: сущности всех доменов — точка синхронизации |
| `packages/contracts/src/blocks/**`, `packages/contracts/src/entities/course.ts` | Владелец B4 (`ws-B` в `OWNERS.yaml`) |
| `packages/contracts/src/routes/<domain>.ts` | Владелец — BE-агент домена (таблица ниже). Любое изменение формы ответа → уведомить FE-потребителей |

| Файл контракта | BE-владелец | FE-потребители |
|---|---|---|
| `auth.ts`, `health.ts` | api-shell (B1) | F6, W3, W4 |
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
| `packages/db/prisma/schema/migrations/**` | Только владелец db. Миграции создаются **сериализованно**: агент меняет схему → владелец db генерирует и коммитит миграцию. Две миграции параллельно — никогда |
| `packages/db/src/seed/**`, `packages/db/src/testing.ts` | Владелец db. Нынешние фрагменты seed (`identity`, `catalog-groups`, `learning`, `ai-payments-notifications`) сквозные — у владельца db; модульный фрагмент `seed/<module>.ts`, объявленный в зоне модуля в `OWNERS.yaml`, — у агента модуля (данные берут из `contracts/fixtures`) |

## 10.4. Владелец «api-shell»

`apps/api/src/{main,worker,app.module,bootstrap}.ts`, `apps/api/src/modules/index.ts`, `apps/api/src/modules/identity/**` (auth core, AGENT_GUIDE §18), `apps/api/src/common/**`, `apps/api/src/config/**`, `apps/api/test/**` (кроме подпапок workstream'ов: `test/ai/**`, `test/analytics/**`, `test/course-builder/**`), `apps/api/package.json` и конфиги пакета (`apps/api/*`), `apps/api/src/types/**`, модули `school` и `health` (`apps/api/src/modules/{school,health}/**`), контракты `routes/{auth,health}.ts`, схемы `identity.prisma` и `school.prisma`.

- Регистрация модуля в `app.module.ts` — единственная правка, которую владелец делает по запросу (одна строка).
- Новое общее (guard, pipe, helper) — запрос владельцу; до этого агент держит helper в своём модуле.

`apps/api/src/modules/<name>/**` — владелец: агент задачи B-модуля. Один модуль — один агент. Подпапки `modules/ai/{onboarding,tutor,insights,trajectory}` — агенты A1–A4; `modules/ai/*` верхнего уровня — B10.

## 10.5. Владелец «web-shell»

`apps/web/src/app/**` (роутер, shells, bottom-nav config, providers), `apps/web/src/shared/{api,auth,max}/**`, `apps/web/src/shared/config.ts`, `apps/web/src/shared/{store,ui}/**`, `apps/web/src/shared/i18n/**` (кроме словарей фич, см. ниже), `apps/web/src/shared/lib/**`, `apps/web/vite.config.ts`, `apps/web/package.json` и остальные конфиги пакета (`apps/web/*`, `apps/web/public/**`, `apps/web/src/*`, `apps/web/src/test/**`), а также foundation-экраны и фичи входа: `pages/{auth,admin,forbidden,not-found}/**`, `entities/session/**`, `features/{dev-login,switch-role}/**`, `widgets/account-section/**`. Внутри `shared/api/**` доменные MSW-хендлеры `mocks/handlers/<domain>.ts`, закреплённые в `OWNERS.yaml` за workstream'ом (например, `course-builder.ts`, `files.ts` — G), принадлежат ему; `shared/max/**` на время workstream J — у J (координация с web-shell).

Механизмы, чтобы FE-агенты не трогали shell:
- **Роуты**: фича экспортирует `pages/<role>/<feature>/routes.tsx` (`RouteObject[]`); владелец shell подключает одной строкой в `router.tsx`.
- **MSW**: агент пишет `mocks/handlers/<domain>.ts`; владелец добавляет в `handlers/index.ts`.
- **Query-keys**: общий файл содержит только префиксы; ключи сущностей — в `entities/<x>/keys.ts`.
- **i18n**: `shared/i18n/<ns>.ru.json` — по namespace на фичу, владелец — агент фичи (в `OWNERS.yaml` каждый словарь фичи указан явно: `parent*`, `invite`, `performance` — D, `parent-tutor` — C, `teacher-home`/`teacher-profile` — E, `teacher-performance` — F, `teacher-wallet` — I, `notifications` — L); общие словари нескольких фич (`common`, `auth`, `student`, `teacher`) и тесты словарей — web-shell. `index.ts` подхватывает по glob.
- **Меню**: пункты BottomNav — в `app/bottom-nav.config.ts` у владельца; агент просит добавить.

`apps/web/src/{pages,widgets,features,entities}/<x>/**` — владелец: FE-агент задачи W-* по таблице в `09-tasks.md`. Пересечения разведены подпапками: `entities/course/**` — W2, `entities/course/editors/**` — W10; `entities/club` — W4 (W6 использует, не правит).

Режим репетитора (docs/07 F16–F18) разложен по workstream'ам из `12-workstreams.md`:
- E — `pages/teacher/{home,groups,settings,profile,more}/**`, `widgets/teacher-{home,group}-*/**`;
- F — `pages/teacher/{students,performance}/**`, `widgets/teacher-{student,performance}-*/**`;
- I — `pages/teacher/wallet/**`, `features/withdraw-wallet/**`;
- D — общий виджет `widgets/homework-performance/**` (статусы заданий, сетка, карточка задания): его используют родитель и преподаватель.

Прочие закрепления вне режима репетитора: `widgets/{homework-map,homework-recommendations}/**` (экран «Задания» ученика) — B; `pages/student/settings/**` и `widgets/notification-settings/**` — L; `apps/api/test/analytics/**` — A.

Префиксы виджетов не пересекаются: у каждого `widgets/teacher-*` один владелец (E — главная и группы, F — ученик и успеваемость). Пути экранов преподавателя, на которые ссылаются страницы разных фич, и состояние навигации «открыт из приложения» — в `shared/lib/{teacher-paths,navigation}.ts` (web-shell): страницы не импортируют модули друг друга.

## 10.6. Владельцы «ui» и «ai»

- `packages/ui/**` — владелец ui (F7). Новые компоненты — запрос; временно компонент живёт в `apps/web/src/shared/ui/` у автора запроса.
- `packages/ai/**` (`provider.ts`, `service.ts`, `json.ts`, `providers/mock.ts`, `context/**`, `prompts/registry.ts` и т.д.) — владелец ai (F8).
- `packages/ai/src/prompts/**` — workstream C (`ws-C-ai`); `packages/ai/src/providers/gigachat/**` и `packages/ai/README.md` — workstream K.

## 10.7. `OWNERS.yaml` (формат)

Единственный актуальный источник — корневой `OWNERS.yaml`; здесь только формат (минимальный парсер в `scripts/check-ownership.mjs` понимает ровно его, фигурные скобки `{a,b}` в глобах не раскрываются — каждый путь отдельной строкой):

```yaml
owners:
  core:
    - docs/**
    - scripts/**
  db:
    - packages/db/prisma/schema/base.prisma
    - packages/db/prisma/schema/migrations/**
  ws-C-ai:
    - packages/ai/src/prompts/** # вложена в зону ai (packages/ai/**) — побеждает более конкретный глоб
```
