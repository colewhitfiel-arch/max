# 9. Задачи для параллельной разработки

> **Статус (2026-09-21):** волна 0 (F1–F8, F9 в виде фикстур в contracts) выполнена — см. `FOUNDATION.md`. Актуальное разбиение работы на независимые направления с зонами и критериями — `12-workstreams.md`; таблицы ниже сохранены как исходный план и справочник по DoD модулей.

Правила:
- Одна задача = один агент = свой набор папок (владение — `10-ownership.md`). Пересечение папок между активными задачами запрещено.
- Перед стартом агент читает `docs/README.md`, свой раздел здесь, `04`, `05` (свой домен), `08`, `10`.
- Задача готова при выполнении DoD и зелёном CI. Ветка `feat/<ID>-<slug>`.
- FE-задачи волны 1 работают против MSW-моков и **не ждут** backend.
- Если задача требует изменить чужой файл — запрос владельцу, не правка.

## Волна 0 — фундамент (владелец «core», последовательно)

| ID | Задача | Папки | DoD |
|---|---|---|---|
| F1 | Монорепо: pnpm, turbo, tsconfig, eslint/prettier, CI (lint/typecheck/test), `CLAUDE.md`, `README.md`, `OWNERS.yaml` + `scripts/check-ownership.ts` | корень, `packages/config`, `.github`, `scripts` | `pnpm lint && pnpm typecheck && pnpm test` зелёные на пустых пакетах |
| F2 | Dev-инфра: docker-compose (postgres, redis, minio), `.env.example`, `apps/api/src/config/env.ts` (zod) | `infra/`, `.env.example`, `apps/api/src/config` | `docker compose up` поднимает 3 сервиса; невалидный env валит старт |
| F3 | `packages/db`: Prisma multi-file schema — **вся модель из 04**, init-миграция, клиент, каркас seed | `packages/db` | `prisma migrate dev` чист; `pnpm db:seed` создаёт демо-мир |
| F4 | `packages/contracts`: common, enums, errors, events, blocks, **все контракты из 05** (DTO полные, реализация не нужна), фикстуры демо-мира | `packages/contracts` | typecheck; экспорт `apiContract`; снапшот-тест путей и схем |
| F5 | `apps/api` каркас: Nest, Prisma-модуль, auth (Dev + Max-заглушка), JWT, RolesGuard, фильтр ошибок, zod-pipe, DomainEvents, BullMQ, идемпотентность, health, `worker.ts`, пустые модули по списку | `apps/api/src/{main,worker,app.module}.ts`, `common/`, пустые `modules/*` | `POST /auth/dev` → JWT; `GET /me`; worker стартует и обрабатывает тестовый job |
| F6 | `apps/web` каркас: Vite, роутер + 3 shell'а + BottomNav, providers, ts-rest клиент, MSW-режим, i18n, тема, max-bridge адаптер + mock, экраны auth/выбора роли, `useAiStream` | `apps/web/src/app`, `apps/web/src/shared`, `pages/auth` | В браузере открываются 3 роли с меню; `VITE_API_MODE=mock` работает |
| F7 | `packages/ui`: токены, тема, компоненты из 6.4, демо-страница | `packages/ui` | Все компоненты в демо в обеих темах |
| F8 | `packages/ai`: GigaChat-клиент (OAuth, chat, stream, embeddings), `LlmProvider`, `FakeLlmProvider`, `PromptRegistry`, `parseJsonResponse`, сериализация `StudentContext` | `packages/ai` | Unit на fake; smoke-скрипт на реальном API за флагом |

Порядок: F1 → F2 → (F3 ∥ F4) → (F5 ∥ F6 ∥ F7 ∥ F8). F6 и F7 могут идти параллельно с F4, если стартуют с заглушек.

## Волна 1 — backend (параллельно, после F3–F5)

| ID | Модуль | Папки | Зависит от | DoD |
|---|---|---|---|---|
| B1 | identity + school: `/auth/*`, `/me*`, роли, профили, linkCode, `RefreshToken`, inviteCode школы, событие `student.profile.updated` | `modules/identity`, `modules/school`, `contracts/auth.ts` | F5 | Интеграционные тесты auth-флоу, добавления и смены роли |
| B2 | catalog + groups + schedule: клубы, группы, зачисление, правила, `schedule.materialize` job, календарные выборки, teacher lessons CRUD, `/catalog/*`, `/teachers/:id` | `modules/catalog`, `modules/groups`, `contracts/catalog.ts`, `contracts/groups.ts` | F5 | Тест материализации на 8 недель с tz школы; политика контактов преподавателя |
| B3 | attendance: sheet, upsert, `Lesson→DONE`, событие, `listByStudent`, `countable` | `modules/attendance`, `contracts/attendance.ts` | B2 (интерфейсы) | Чужая группа → 403; повторный PUT идемпотентен |
| B4 | courses: структура, `PUT structure`, `PATCH block`, publish (событие + `assignments.createFromBlocks`), student views, block progress, `CourseProgress` | `modules/courses`, `contracts/courses.ts`, `contracts/blocks/` | B2, B5 (интерфейсы) | publish создаёт задания; complete QUIZ считает балл; QUIZ без ответов ученику |
| B5 | assignments: простые задания, сдачи, попытки, автопроверка QUIZ, grade, `createFromBlocks`, `submitFromBlock` | `modules/assignments`, `contracts/assignments.ts` | B2 | isLate, лимит попыток, идемпотентность submit |
| B6 | analytics: `ActivityEvent`, `StudentStatsDaily` job (по событиям + ночной), формулы 4.6, needsAttention, все дашборды из `dashboards.ts` | `modules/analytics`, `contracts/dashboards.ts` | B1–B5 (сервисы), события | Юнит-тесты формул на фикстурах; дашборды отдают DTO из 05 |
| B7 | files: presigned upload/confirm/get, `StorageProvider`, extract-пайплайн (pdf/docx/pptx/txt), `OcrProvider` порт | `modules/files`, `contracts/files.ts` | F5 | Загрузка через MinIO в тестах; extract docx/pdf из фикстур |
| B8 | family + payments: привязка, `/parent/children*`, `PaymentProvider` + ЮKassa + Fake, вебхук, `PaidPeriod`, история, `nextPaymentAt` | `modules/family`, `modules/payments`, `contracts/family.ts`, `contracts/payments.ts` | B1, B2 | Вебхук с подписью и идемпотентностью; цена фиксируется в платеже |
| B9 | notifications + support: `notify`, обработчики всех событий → уведомления по настройкам, напоминание за 1 ч до занятия (job), `/notifications*`, `/support*`, `/me/notification-settings` | `modules/notifications`, `modules/support`, `contracts/notifications.ts`, `contracts/support.ts` | B1, события | Событие → уведомления нужным получателям с учётом настроек |
| B10 | ai-core: хранение диалогов, `context-builder` (кэш Redis), `AiInsight` кэш + jobs, `/ai/conversations*` со стримом, инвалидация по событиям, rate limit | `modules/ai` (кроме подпапок A*), `contracts/ai.ts` | F8, B2–B6 (read-сервисы) | Стрим и сохранение сообщений на `FakeLlmProvider`; лимит → 429 |

Старт: B1, B2, B7 первыми (на них опираются остальные); B3, B4, B5, B8, B9 — как только опубликованы интерфейсы B2 (`groups.service.ts` сигнатуры); B6, B10 — последними.

## Волна 1 — frontend (параллельно, после F4, F6, F7; против моков)

| ID | Экраны | Папки | DoD |
|---|---|---|---|
| W1 | Ученик: главная + календарь | `pages/student/home`, `widgets/student-home-*`, `entities/lesson` | Все состояния (пусто/загрузка/ошибка); `aiComment=null` не ломает |
| W2 | Ученик: курсы, курс, вьюер всех 9 типов блоков, список заданий, сдача | `pages/student/courses`, `entities/course` (кроме `editors/`), `entities/assignment`, `features/submit-assignment`, `features/complete-block` | Каждый BlockType рендерится из фикстур; загрузка файла через presigned |
| W3 | Ученик: профиль, траектория, настройки, поддержка, смена роли | `pages/student/profile`, `pages/student/settings`, `features/support`, `features/switch-role` | Тема/язык применяются мгновенно и персистятся |
| W4 | Онбординг-диалог + выбор кружков; чат тьютора со стримингом | `pages/onboarding`, `pages/student/tutor`, `entities/ai`, `entities/club` (карточка для выбора) | Стрим из MSW; 429 показан по-человечески; диалоги листаются |
| W5 | Родитель: дети/привязка/переключение, главная, аналитика | `pages/parent/{children,home,analytics}`, `entities/student`, `widgets/parent-*` | Смена ребёнка перезапрашивает всё; период меняется |
| W6 | Родитель: кружки, карточка кружка, карточка преподавателя, платежи + оплата | `pages/parent/{clubs,payments}`, `entities/payment`, `features/pay`, `widgets/teacher-card` | Опрос статуса платежа до терминального; контакты скрыты по политике |
| W7 | Преподаватель: главная, группы, группа, карточка ученика | `pages/teacher/{home,groups,student-card}`, `widgets/teacher-*` | «Требуют внимания» с причинами; toGrade ведёт на проверку |
| W8 | Преподаватель: занятия группы, отметка посещаемости, создание/отмена занятия | `pages/teacher/attendance`, `features/mark-attendance`, `features/manage-lesson` | Оптимистичный апдейт с откатом |
| W9 | Преподаватель: задания — создание простого, список, сдачи, проверка | `pages/teacher/assignments`, `features/create-assignment`, `features/grade-submission` | Проверка с обратной связью; фильтры open/closed |
| W10 | Преподаватель: course builder — загрузка, прогресс job, редактор черновика/курса (9 редакторов блоков), публикация с дедлайнами | `pages/teacher/course-builder`, `entities/course/editors`, `features/publish-course`, `features/generate-course` | Round-trip: draft → PUT → тот же draft; stage/progress отображаются |
| W11 | Уведомления: центр, бейдж в меню, прочтение | `pages/notifications`, `entities/notification` | Бейдж обновляется после прочтения |

## Волна 2 — ИИ-фичи (после B10 + указанных модулей)

| ID | Задача | Папки | Зависит |
|---|---|---|---|
| A1 | Онбординг: промпт-диалог, извлечение `profileDraft`, рекомендации (LLM-ранжирование каталога с причинами; эмбеддинги — если каталог > 50), `complete` | `modules/ai/onboarding`, `packages/ai/src/prompts/onboarding.ts` | B1, B2, B10 |
| A2 | Тьютор: системный промпт с `StudentContext`, история, лимиты, safety-правила | `modules/ai/tutor`, `prompts/tutor.ts` | B10 |
| A3 | Инсайты: 3 вида, jobs, кэш, инвалидация с дебаунсом 1 ч, ночной прогон, `INSIGHT_READY` | `modules/ai/insights`, `prompts/insights.ts` | B6, B10 |
| A4 | Траектория: генерация, cron + триггер по событиям, `sourceHash`, ручной refresh | `modules/ai/trajectory`, `prompts/trajectory.ts` | B6, B10 |
| A5 | Course builder: OUTLINE (map-reduce), GENERATE (параллельно по модулям), ASSEMBLE, ретраи, accept → Course, cancel | `modules/course-builder`, `contracts/course-builder.ts`, `prompts/course-builder.ts` | B4, B7, B10 |

## Волна 3 — интеграция и закалка

| ID | Задача |
|---|---|
| I1 | Переключение FE с моков на реальный API по ролям (преподаватель → ученик → родитель); расхождения правятся через контракт |
| I2 | MAX Bridge: реальная проверка launch-параметров, тема из MAX, `openLink` для оплаты, storage; тест на устройствах |
| I3 | E2E (Playwright) на F1–F12 из `07-user-flows.md` против seed |
| I4 | Производительность дашбордов: индексы, `EXPLAIN`, кэш `StudentContext`, лимиты выборок |
| I5 | Безопасность: матрица policies (роль × ресурс), rate limits, аудит, PII в логах, зависимости |
| I6 | Реальный платёжный провайдер на стейдже, вебхуки; возвраты — если нужны |
| I7 | Push через MAX (если API есть), напоминания о занятиях/дедлайнах |
| I8 | 4-я роль — после проработки продуктом |
