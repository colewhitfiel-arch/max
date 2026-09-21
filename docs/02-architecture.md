# 2. Архитектура

## 2.1. Контекст

```
┌──────────────┐   WebView    ┌──────────────────┐   HTTPS JSON + SSE  ┌──────────────────┐
│ Клиент MAX   │ ───────────▶ │ apps/web (React) │ ──────────────────▶ │ apps/api (Nest)  │
│ iOS/Android/ │              │ мини-приложение  │                     │ HTTP-процесс     │
│ desktop      │ ◀─ bridge ── │                  │                     └───────┬──────────┘
└──────────────┘              └──────────────────┘                             │
                                                                               ▼
   ┌──────────────┐      ┌──────────────────┐        ┌──────────────────────────────────┐
   │ GigaChat API │ ◀─── │ apps/api         │ ◀────▶ │ PostgreSQL │ Redis │ S3 (MinIO)   │
   └──────────────┘      │ worker-процесс   │        └──────────────────────────────────┘
   ┌──────────────┐      │ (BullMQ)         │
   │ Платёжный    │ ◀──▶ └──────────────────┘
   │ провайдер    │ ── webhooks ──▶ apps/api (HTTP)
   └──────────────┘
```

- Один фронтенд для всех ролей (одно мини-приложение в MAX); роль определяет корневой маршрут и нижнее меню.
- Один backend-код (`apps/api`), два процесса: HTTP-API и worker (очереди). Это **модульный монолит**: модули изолированы по папкам, таблицам и контрактам, деплоятся вместе. Выделение в сервисы — только по факту нагрузки (кандидат №1 — `course-builder`).

## 2.2. Стек (ADR-001…ADR-005)

| Слой | Выбор | Почему |
|---|---|---|
| Язык | TypeScript везде, Node 22 | Общие типы FE/BE, один инструментарий для агентов |
| Монорепо | pnpm workspaces + Turborepo | Кросс-пакетные зависимости, кеш сборок |
| Frontend | React 19, Vite, React Router 7, TanStack Query 5, Zustand, Tailwind 4, i18next, MSW | Mobile-first SPA под WebView; MSW даёт FE-разработку без готового BE |
| Backend | NestJS 11, zod, ts-rest (contract-first), pino | Модульность, DI, guards; контракт — единый источник типов |
| БД | PostgreSQL 16 + Prisma 6 (multi-file schema) | Много связей; схема разбита по модулям |
| Очереди/кеш | Redis 7 + BullMQ | ИИ-пайплайны, пересчёт аналитики, напоминания |
| Файлы | S3-совместимое (MinIO локально) | Presigned upload прямо из WebView |
| ИИ | GigaChat API через порт `LlmProvider` | Замена провайдера/модели без правки фич |
| Платежи | Порт `PaymentProvider`, адаптер ЮKassa | Провайдер не зафиксирован продуктом |
| Тесты | Vitest (unit), Supertest + Testcontainers (api), Playwright (e2e) | |
| Инфра | Docker Compose (dev), Dockerfile на процесс, GitHub Actions | |

## 2.3. Backend: структура модуля

```
modules/<name>/
  <name>.module.ts        // Nest-модуль, экспортирует публичный сервис
  <name>.controller.ts    // реализация контракта из packages/contracts
  <name>.service.ts       // прикладная логика, публичный API модуля
  <name>.repository.ts    // доступ к Prisma (только свои таблицы)
  <name>.policies.ts      // проверки доступа к ресурсам
  <name>.events.ts        // публикация доменных событий (типы в contracts/events)
  <name>.jobs.ts          // BullMQ-процессоры, запускаются только в worker
  __tests__/
```

Правила:
1. Контроллер без логики: валидация zod-схемой контракта → сервис → DTO.
2. Модуль читает **только свои** таблицы. Чужие данные — через публичный сервис чужого модуля (DI) или через read-model модуля `analytics`.
3. Запись в чужие таблицы запрещена. Реакции на изменения — через доменные события.
4. Проверки доступа — в `*.policies.ts`, вызываются сервисом. Guard на контроллере проверяет только роль.

## 2.4. Cross-cutting (`apps/api/src/common`)

- **Auth.** `POST /auth/max` принимает launch-данные MAX; `MaxAuthProvider.verify()` проверяет подпись и возвращает `maxUserId` + профиль. Сервер выдаёт access JWT (15 мин: `userId`, `roles[]`, `activeRole`, `profileId`) и refresh (30 дней, хранится хэш). В dev — `DevAuthProvider` (заголовок `X-Dev-User`).
- **RBAC.** `@Roles(...)` по `activeRole`; ресурсный доступ — в policies (`assertTeacherOwnsGroup`, `assertParentLinked`, `assertStudentEnrolled`).
- **Ошибки.** Единый формат `{ error: { code, message, details? } }`, коды в `contracts/errors.ts`. Prisma-ошибки маппятся в 404/409.
- **Валидация.** `ZodValidationPipe` со схемами контракта.
- **Конфиг.** `config/env.ts` со схемой zod; приложение не стартует с невалидным окружением.
- **Логи.** pino, request-id; в логах ИИ-запросов — только ids и размеры, без текста.
- **Время.** В БД UTC (`timestamptz`). Границы «сегодня/неделя» считаются в `School.timezone`. Клиент отображает в поясе устройства.
- **Пагинация.** Cursor-based `{ items, nextCursor }`.
- **Идемпотентность.** `Idempotency-Key` на сдаче задания и создании платежа; ключ хранится в Redis 24 ч.
- **Rate limit.** ИИ-эндпоинты (по пользователю), вебхуки (по IP).

## 2.5. Распространение данных

Синхронно пишется только своя таблица, затем публикуется событие; производные данные обновляются обработчиками.

| Событие | Публикует | Реагируют |
|---|---|---|
| `attendance.marked` | attendance | analytics (день), notifications (родителю при пропуске), ai (инвалидация) |
| `submission.submitted` | assignments | analytics, notifications (преподавателю), ai |
| `submission.graded` | assignments | analytics, notifications (ученику/родителю), ai |
| `block.opened` / `block.completed` | courses | analytics, ai |
| `course.published` | courses | assignments (задания из блоков), notifications (ученикам группы) |
| `lesson.cancelled` | groups | notifications |
| `enrollment.created` | groups | analytics, notifications |
| `payment.succeeded` / `payment.failed` | payments | notifications |
| `generation.finished` | course-builder | notifications (преподавателю) |
| `student.profile.updated` | identity | ai |
| `tutor.message.sent` | ai | analytics |

Реализация: `EventEmitter2` in-process для лёгких реакций в HTTP-процессе; тяжёлые обработчики (пересчёт статистики, ИИ) ставят job в BullMQ. Полный список и payload'ы — `packages/contracts/src/events.ts` (раздел 5.4). Обработчики идемпотентны.

**Read-model для дашбордов.** «Главная» ученика/родителя/преподавателя не собирается на фронте из 8 запросов: у `analytics/dashboards` есть агрегирующие ручки, которые дергают сервисы модулей и отдают один DTO. Дневные агрегаты `StudentStatsDaily` пересчитываются worker'ом по событиям (дебаунс 1 мин) и ночью полностью.

## 2.6. Слой ИИ (`packages/ai` + `modules/ai`)

```
packages/ai/src
  client/gigachat.ts         // OAuth (токен ~30 мин, автообновление), chat.completions, stream, embeddings
  provider.ts                // interface LlmProvider { chat, stream, embed }
  fake-provider.ts           // детерминированный провайдер для тестов/MSW
  prompts/registry.ts        // реестр: id, version, шаблон, zod-схема ответа
  prompts/<feature>.ts       // onboarding, tutor, insights, trajectory, course-builder
  context/student-context.ts // тип StudentContext + сериализация (бюджет ~2500 токенов)
  json.ts                    // извлечение и валидация JSON из ответа, ретраи
```

Принципы:
- Модель получает **сжатый снимок** (`StudentContext`), не сырые таблицы. Снимок строит `modules/ai/context-builder.ts` из публичных сервисов других модулей; кэш 5 мин в Redis, инвалидация по событиям.
- Структурированные ответы (профиль после онбординга, outline курса, траектория) валидируются zod; при невалидном JSON — до 2 ретраев с текстом ошибки.
- Промпты версионируются (`id@version`); версия пишется в `AiInsight`/`AiMessage`/`Trajectory`.
- Кэш инсайтов: `AiInsight(kind, studentId, period, sourceHash, expiresAt)`. Генерация worker'ом по расписанию и по событиям (дебаунс 1 ч), не в запросе пользователя. Нет кэша → ручка отдаёт `null`, фронт показывает «готовится».
- Чат тьютора и онбординг — единственные синхронные вызовы модели (SSE из HTTP-процесса).
- Безопасность: системный промпт с учётом несовершеннолетних, запрет медицинских/юридических советов, PII-минимизация (имя/ник, без фамилий и контактов).
- Бюджет: лимит сообщений тьютора на пользователя в сутки, лимит токенов на запрос, метрики расхода по `promptId`.
- Факты по GigaChat, которые надо перепроверить перед F8: OAuth `POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth` (Basic + `RqUID`, scope `GIGACHAT_API_PERS|B2B|CORP`, TTL 30 мин); API `https://gigachat.devices.sberbank.ru/api/v1` (`/chat/completions` со `stream`, `/embeddings`, `/files`); нужен корневой сертификат НУЦ Минцифры.

## 2.7. Пайплайн создания курса (`modules/course-builder`, worker)

```
UPLOAD → EXTRACT → OUTLINE → GENERATE → ASSEMBLE → REVIEW (человек) → PUBLISH
```

| Этап | Где | Что делает | Артефакт |
|---|---|---|---|
| UPLOAD | api + files | Presigned URL, запись `Material` | `Material(UPLOADED)` |
| EXTRACT | worker (files) | pdf → pdfjs, docx → mammoth, pptx → XML, txt/md → как есть, изображения → порт `OcrProvider` (MVP: заглушка) | текст в S3, `Material(EXTRACTED)` |
| OUTLINE | worker + LLM | Текст (map-reduce при больших объёмах) + инструкции преподавателя → модули | `job.draft.outline` |
| GENERATE | worker + LLM | По каждому модулю (параллельно, лимит 3) → блоки: текст, вопросы, тест, практика, ДЗ, интерактив | `job.draft.modules[]` |
| ASSEMBLE | worker | Сборка `CourseDraft`, оценка времени, проверка схем | `job.stage=READY` |
| REVIEW | web + api | Преподаватель правит черновик; `accept` создаёт `Course(DRAFT)` | `Course` |
| PUBLISH | api (courses) | `Course(PUBLISHED)`, событие → задания из блоков QUIZ/HOMEWORK/PRACTICE/QUESTION | `Assignment[]` |

Каждый этап пишет `stage`/`progress` в `CourseGenerationJob`; фронт опрашивает job раз в 3 с. Job идемпотентен по этапам: перезапуск продолжает с упавшего.

## 2.8. Frontend

```
apps/web/src
  app/        // providers, router, shells (StudentShell/ParentShell/TeacherShell), bottom-nav config
  pages/      // экраны по ролям: student/*, parent/*, teacher/*, auth/*, onboarding/*, notifications/*
  widgets/    // крупные композиции (HomeToday, GroupStudentsTable, CourseStructureEditor)
  features/   // действия пользователя (submit-assignment, mark-attendance, link-child, pay, grade-submission)
  entities/   // модели домена для UI: lesson, assignment, course, student, club, payment, notification, ai
  shared/     // api client, max-bridge, ui, i18n, lib (dates, money), config
```

- Роутинг: `/student/*`, `/parent/*`, `/teacher/*`, `/auth/*`, `/onboarding/*`. Корень редиректит по `activeRole`. Нижнее меню — в shell роли.
- Данные: TanStack Query; префиксы ключей в `shared/api/query-keys.ts`, ключи сущностей — в `entities/<x>/keys.ts`. Клиент — `@ts-rest/react-query` от контракта.
- Локальное состояние: Zustand только для UI (выбранный ребёнок, черновик чата). Серверное — в Query.
- MAX Bridge: `shared/max-bridge/` — адаптер `{ getLaunchParams, getTheme, haptic, openLink, storage }`; вне MAX — mock.
- Тема: CSS-переменные, `data-theme` на `<html>`; по умолчанию из MAX, переопределяется в настройках.
- i18n: `ru` по умолчанию, `en` — заготовка; словари по namespace на фичу.
- Моки: MSW-хендлеры по домену + фикстуры из `packages/contracts/src/fixtures`. FE-агент работает с `VITE_API_MODE=mock`.
- Стриминг ИИ: `fetch` + `ReadableStream` (SSE), хук `useAiStream`.
- WebView: code-splitting по ролям, skeleton'ы на списках, оптимистичные апдейты для посещаемости и прочтения уведомлений.

## 2.9. Безопасность и данные детей

- PII детей минимизируется: ИИ получает имя/ник, класс, учебные данные; никаких телефонов/адресов.
- Контакты преподавателя показываются родителю только при `School.settings.showTeacherContacts && TeacherProfile.contactsVisible`.
- `AuditLog` для отметок посещаемости, оценок, публикаций, платежей.
- Секреты — только через env; сертификат НУЦ Минцифры — в образы api/worker.
- Вебхуки платежей — проверка подписи + идемпотентность по `providerPaymentId`.
- Родитель не видит содержимое чата ребёнка с тьютором.

## 2.10. Уточнения, принятые при реализации foundation (2026-09-21)

- UI-слой — обычный CSS с токенами, без Tailwind (ADR-011); `packages/ui` поставляется исходниками.
- Dev без Docker: embedded PostgreSQL (`pnpm db:up`), `InlineJobQueue`, `MemoryKeyValueStore`, `LocalFsStorage` (ADR-012). Docker-compose остаётся опцией.
- Формат ответов: 2xx → DTO, ошибки → `ApiError`; клиент — `@ts-rest/core` без `@ts-rest/react-query` (ADR-013).
- JWT подписывается на `node:crypto` (HS256) без внешних библиотек; refresh-токен хранит `activeRole`.
- `schedule` планируется отдельным Nest-модулем (не подпапкой `groups`) для чистого владения (workstreams E и H).
- Полный список того, что построено и что временно, — `FOUNDATION.md`.

## 2.11. Окружения и деплой

- `dev`: `docker compose up` (postgres, redis, minio) + `pnpm dev` (web, api, worker). Вход через `DevAuthProvider`.
- `stage`/`prod`: контейнеры `web` (nginx static), `api`, `worker`; управляемые Postgres/Redis/S3. Миграции — отдельным шагом до раскатки `api`.
- CI: lint + typecheck + unit на каждый PR; api-интеграционные с Testcontainers; e2e — nightly.
