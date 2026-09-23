# 6. Shared-компоненты и типы

> **Статус (2026-09-23):** §6.1, §6.3, §6.5, §6.6 сверены с кодом. §6.4 (состав `@edu/ui`) — исходный план: фактический набор компонентов — `packages/ui/src/index.ts` и песочница `/dev/ui`; что построено в foundation — `FOUNDATION.md`.

## 6.1. `packages/contracts` — типы API
Экспортирует: enum'ы (4.1), общие DTO (5.2), zod-схемы всех DTO, ts-rest роутер `apiContract`, коды ошибок, события (5.4), схемы контента блоков (4.4), `CourseDraft`, фикстуры демо-мира. Тип `StudentContext` живёт в `packages/ai` (`src/context/student-context.ts`): пакет ai не зависит от contracts, снимок собирает `apps/api/src/modules/ai/context-builder`. Никакой логики, только схемы/типы/константы. Зависимостей на Nest/React нет.

Справочники: `CLUB_CATEGORIES` + словарь названий, `ATTENDANCE_LABELS`, `BLOCK_TYPE_META` (иконка, название, «является заданием»).

## 6.2. `packages/db`
Prisma schema (multi-file), миграции, `PrismaClient` singleton, seed. Экспортирует типы Prisma для api. Фронт **не** зависит от `db`.

## 6.3. `packages/ai`
Порт `AiProvider` (алиас `LlmProvider`), `AiService` (retry/timeout/семафор параллельности), `GigaChatProvider` (`providers/gigachat/`), `MockAiProvider` (`providers/mock.ts`, алиас `FakeLlmProvider`), `PromptRegistry` (`prompts/registry.ts`), тип и сериализация `StudentContext` (`context/student-context.ts`), `parseJsonResponse<T>(schema)` (`json.ts`). Используется в `apps/api` (HTTP и worker). Не знает о Prisma.

`StudentContext` (сериализуется в текст ≤ ~2500 токенов):
```
{ student: { name, classLabel?, interests[], goals[], weeklyHours?, preferredFormats[], futureInterests?[], aiProfileSummary? },
  clubs: [{ title, category, teacherName, scheduleText, progressPercent, attendanceRate }],
  laterClubs?: [{ title, reason? }]                         // «попробовать позже» из онбординга
  upcomingLessons: [{ club, startsAt, topic? }]            // 7 дней
  openAssignments: [{ title, club, dueAt?, type, status }]  // все открытые; в текст — не больше maxItems (10)
  recentResults: [{ title, club, score, maxScore, isLate, at }]  // ≤10
  stats30d: { attendanceRate, completionRate, activityScore, absences, lateCount },
  courseProgress: [{ course, percent, nextBlockTitle? }],
  trajectory?: { summary, nextSteps[] },
  now, timezone }
```

Промпты (id; актуальная версия — в `packages/ai/src/prompts/*.ts`): `onboarding.turn`, `onboarding.recommend-clubs`, `tutor.system`, `tutor.parent`, `trajectory.build`, `course-builder.material-from-topic`, `course-builder.survey`, `course-builder.block`. Ещё не реализованы: `insight.student-home`, `insight.parent-summary`, `insight.teacher-student`.

## 6.4. `packages/ui` — дизайн-система (mobile-first, WebView MAX)

Токены (CSS-переменные, светлая/тёмная тема): цвета (`bg`, `surface`, `surface-2`, `text`, `text-muted`, `primary`, `success`, `warning`, `danger`, `border`), радиусы (8/12/16), тени, отступы (сетка 4px), типографика (4 размера + вес).

Компоненты первой волны:
- Каркас: `Screen`, `TopBar`, `BottomNav`, `Sheet` (bottom sheet), `Modal`, `Tabs`, `SegmentedControl`.
- Базовые: `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Chip`, `Badge`, `Avatar`, `Skeleton`, `EmptyState`, `ErrorState`, `Spinner`, `Toast`.
- Данные: `Card`, `ListRow`, `StatTile`, `ProgressBar`, `ProgressRing`, `TrendDelta`, `WeekStrip` (календарная лента), `MiniBarChart`, `PeriodPicker`.
- Чат: `ChatMessage`, `ChatInput`, `TypingIndicator`, `StreamingText`.
- Файлы: `FileUploader` (presigned, прогресс), `FilePreview`.

Доменные компоненты живут в `apps/web/src/entities`, не в `packages/ui`: `LessonCard`, `AssignmentCard`, `CourseCard`, `ClubCard`, `StudentRow`, `PaymentRow`, `NotificationRow`, `ChildSwitcher`.

Рендереры блоков курса (`entities/course/blocks/`) — по одному на `BlockType`: `TextBlock`, `VideoBlock`, `ImageBlock`, `FileBlock`, `QuizBlock`, `QuestionBlock`, `PracticeBlock`, `HomeworkBlock`, `InteractiveBlock`. Редакторы для преподавателя (`entities/course/editors/`): `*BlockEditor` + `CourseStructureEditor`.

Правило промоушена: компонент сначала живёт в фиче; когда он нужен второй фиче — переносится в `entities` или `packages/ui` владельцем UI.

## 6.5. `apps/web/src/shared`
- `api/client.ts` — ts-rest клиент + react-query обёртки; `api/sse.ts` — стрим (`useAiStream`); `api/query-keys.ts` — префиксы (`['student']`, `['parent', studentId]`, `['teacher']`, `['ai']`, `['notifications']`).
- `max/` — `MaxBridge` интерфейс (`types.ts`) + реальный адаптер (`sdk-bridge.ts`) + mock (`mock-bridge.ts`), провайдер и хуки (`index.tsx`).
- `i18n/` — i18next, namespaces по фичам.
- `lib/dates.ts` («сегодня, 15:30», «через 2 дня», недели, tz), `lib/money.ts` (копейки → «1 500 ₽»), `lib/format.ts` (проценты, склонения); `api/errors.ts` (`ApiClientError` → текст).
- `config.ts` — `VITE_API_URL`, `VITE_API_MODE=mock|real`.

## 6.6. `apps/api/src/common`
- `auth/` — порт `AuthProvider` (`providers/`: `MaxAuthProvider`, `DevAuthProvider`), `JwtService`, `AuthGuard`, `AccessGuard`, `@CurrentUser()`, `@Public()`, `@Roles()`, `@RequirePermission()`.
- `events/` — типизированная шина `DomainEventBus` и декоратор `@OnDomainEvent` (типы из `contracts/events`).
- `queue/` — порт `JobQueue`: `InlineJobQueue` (dev, `QUEUE_DRIVER=inline`) и `BullMqJobQueue` (Redis); обработчики регистрируются через `JobQueue.process(...)`.
- `errors/` (`Errors.*`, `ApiExceptionFilter`), `validation/` (`ZodValidationPipe`), `pagination/` (cursor helpers), `logger/`, `kv/` (`KeyValueStore`), `prisma/`, `time/` (`schoolNow`, границы дня/недели по tz).
- Тестовые помощники — не в `common`, а в `apps/api/test/helpers/` (`env.ts`, `mini-app.ts`, `test-app.ts`).
