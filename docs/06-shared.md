# 6. Shared-компоненты и типы

## 6.1. `packages/contracts` — типы API
Экспортирует: enum'ы (4.1), общие DTO (5.2), zod-схемы всех DTO, ts-rest роутер `apiContract`, коды ошибок, события (5.4), схемы контента блоков (4.4), `CourseDraft`, тип `StudentContext`, фикстуры демо-мира. Никакой логики, только схемы/типы/константы. Зависимостей на Nest/React нет.

Справочники: `CLUB_CATEGORIES` + словарь названий, `ATTENDANCE_LABELS`, `BLOCK_TYPE_META` (иконка, название, «является заданием»).

## 6.2. `packages/db`
Prisma schema (multi-file), миграции, `PrismaClient` singleton, seed. Экспортирует типы Prisma для api. Фронт **не** зависит от `db`.

## 6.3. `packages/ai`
`LlmProvider`, `GigaChatProvider`, `FakeLlmProvider`, `PromptRegistry`, сериализация `StudentContext`, `parseJsonResponse<T>(schema)`. Используется в `apps/api` (HTTP и worker). Не знает о Prisma.

`StudentContext` (сериализуется в текст ≤ ~2500 токенов):
```
{ student: { name, classLabel?, interests[], goals[], weeklyHours?, preferredFormats[], aiProfileSummary? },
  clubs: [{ title, category, teacherName, scheduleText, progressPercent, attendanceRate }],
  upcomingLessons: [{ club, startsAt, topic? }]            // 7 дней
  openAssignments: [{ title, club, dueAt?, type, status }]  // ≤10
  recentResults: [{ title, club, score, maxScore, isLate, at }]  // ≤10
  stats30d: { attendanceRate, completionRate, activityScore, absences, lateCount },
  courseProgress: [{ course, percent, nextBlockTitle? }],
  trajectory?: { summary, nextSteps[] },
  now, timezone }
```

Промпты (id@version): `onboarding.dialog@1`, `onboarding.profile-extract@1`, `onboarding.recommend@1`, `tutor.system@1`, `insight.student-home@1`, `insight.parent-summary@1`, `insight.teacher-student@1`, `trajectory@1`, `course.outline@1`, `course.generate-module@1`, `course.summarize-chunk@1`.

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
- `max-bridge/` — `MaxBridge` интерфейс + реальный адаптер + mock.
- `i18n/` — i18next, namespaces по фичам.
- `lib/dates.ts` («сегодня, 15:30», «через 2 дня», недели, tz), `lib/money.ts` (копейки → «1 500 ₽»), `lib/format.ts` (проценты, склонения), `lib/errors.ts` (ApiError → текст).
- `config.ts` — `VITE_API_URL`, `VITE_API_MODE=mock|real`.

## 6.6. `apps/api/src/common`
- `auth/` — `MaxAuthProvider`, `DevAuthProvider`, `JwtService`, `@CurrentUser()`, `RolesGuard`, `@Roles()`.
- `events/` — типизированный `DomainEvents.emit/on` поверх EventEmitter2 (типы из `contracts/events`).
- `queue/` — фабрика очередей BullMQ, `@Processor` регистрация только в worker.
- `filters/ApiExceptionFilter`, `pipes/ZodValidationPipe`, `pagination/` (cursor helpers), `logger/`, `idempotency/` (декоратор + Redis), `time/` (`schoolNow`, границы дня/недели по tz).
- `testing/` — фабрики тестовых данных из фикстур, `createTestApp()`.
