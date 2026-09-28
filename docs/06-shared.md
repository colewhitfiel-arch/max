# 6. Shared-компоненты и типы

> **Статус (2026-09-23):** §6.1, §6.3, §6.5, §6.6 сверены с кодом. §6.4 (состав `@edu/ui`) — исходный план: фактический набор компонентов — `packages/ui/src/index.ts` и песочница `/dev/ui`; что построено в foundation — `FOUNDATION.md`.

## 6.1. `packages/contracts` — типы API
Экспортирует: enum'ы (4.1), общие DTO (5.2), zod-схемы всех DTO, ts-rest роутер `apiContract`, коды ошибок, события (5.4), схемы контента блоков (4.4), `CourseDraft`, фикстуры демо-мира. Тип `StudentContext` живёт в `packages/ai` (`src/context/student-context.ts`): пакет ai не зависит от contracts, снимок собирает `apps/api/src/modules/ai/context-builder`. Никакой логики, только схемы/типы/константы. Зависимостей на Nest/React нет.

Справочники: `CLUB_CATEGORIES` + словарь названий, `ATTENDANCE_LABELS`, `BLOCK_TYPE_META` (иконка, название, «является заданием»). Русские подписи (`ROLE_LABELS`, `CLUB_CATEGORY_LABELS`, `ATTENDANCE_LABELS`, `BLOCK_TYPE_META[].label`, `KNOWLEDGE_NODE_TYPE_LABELS`) веб **не использует**: подписи enum во фронте — из i18n (`common:roles.*`, `clubCategory.*`, `blockType.*`, `knowledgeNodeType.*`, `billing.period.*`), чтобы переключались с языком. Нужны ли константы apps/api — решает владелец contracts.

Хелперы: `toStudentBlock(block)` (блок без ответов для ученика, docs/05 §5.3 courses), `isHttpUrl`/`HttpUrlSchema` (ссылки только http/https), `materialize*` фикстур (docs/05 §5.5).

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

Доменные компоненты живут в `apps/web/src/entities`, не в `packages/ui`: `LessonCard`, `AssignmentCard`, `CourseCard`, `ClubCard`, `StudentRow`, `PaymentRow`, `NotificationRow`. (`ChildSwitcher` удалён: выбор ребёнка — сердца на главной родителя и экран «Дети».)

Поведение компонентов `@edu/ui`, на которое опираются фичи (подробно — `packages/ui/README.md`):
- `Text preserveLines` — сохраняет переносы строк (`white-space: pre-wrap`); инлайн-`style` в фичах не нужен.
- `Markdown source` — безопасный рендер Markdown без зависимостей (TEXT-блоки курса): заголовки `#`…`###`, абзацы с переносами строк, жирный/курсив, код и блоки кода (`CodeBlock`), списки, цитаты, ссылки только http(s) (`onLinkClick` — переход через MaxBridge); сырой HTML — текстом, `dangerouslySetInnerHTML` не используется. `markdownToText` — тот же текст без разметки (превью в конструкторе курса).
- `Chip` ставит `aria-pressed` только при переданном `selected` (в том числе `false`); без него — обычная кнопка (стартеры чата тьютора).
- `ListRow onClick` нажимается по Enter/Space только с фокусом на самой строке; клик вложенной кнопки всплывает — её `onClick` вызывает `stopPropagation()`.
- `Button`/`IconButton` в `loading` — `aria-busy` + `aria-disabled` (фокус не теряется, нажатие гасится) вместо `disabled`; тесты проверяют `aria-disabled`, формы дополнительно проверяют `mutation.isPending`.
- `CardColumns` (`variant="default"`) — size-container по ширине: ширину задаёт родитель (внутри shrink-to-fit контейнера её надо задать явно); уже 380px — зазор колонок 8px и поля карточек 6px; потолок `fit`-колонки 45% — только рядом с «резиновой» колонкой. Строки связаны через `aria-owns` (в VoiceOver/Safari поддержка частичная — техдолг).
- Служебные подписи (`closeLabel`, `backLabel`, `regionLabel`, `inputLabel` чата и т.п.) веб передаёт из i18n; доступное имя поля чата — «Сообщение»/«Message», а не плейсхолдер. `I18nextProvider` снаружи `ToastProvider` (`app/providers.tsx`).

Рендереры блоков курса (`entities/course/blocks/`) — по одному на `BlockType`: `TextBlock`, `VideoBlock`, `ImageBlock`, `FileBlock`, `QuizBlock`, `QuestionBlock`, `PracticeBlock`, `HomeworkBlock`, `InteractiveBlock`. Редакторы для преподавателя (`entities/course/editors/`): `*BlockEditor` + `CourseStructureEditor`.

Правило промоушена: компонент сначала живёт в фиче; когда он нужен второй фиче — переносится в `entities` или `packages/ui` владельцем UI.

## 6.5. `apps/web/src/shared`
- `api/client.ts` — ts-rest клиент + react-query обёртки; `api/sse.ts` — стрим (`useAiStream`); `api/query-keys.ts` — префиксы (`['student']`, `['parent', studentId]`, `['teacher']`, `['ai']`, `['notifications']`).
- `max/` — `MaxBridge` интерфейс (`types.ts`) + реальный адаптер (`sdk-bridge.ts`) + mock (`mock-bridge.ts`), провайдер и хуки (`index.tsx`).
- `i18n/` — i18next, namespaces по фичам; ru и en совпадают по ключам (тест `dictionaries.test.ts`), плюрализация — суффиксы `_one/_few/_many/_other` (ru) и `_one/_other` (en) с переменной `count`. Обращение: ученик — на «ты», родитель и преподаватель — на «вы», общие тексты (ошибки, выбор роли) — без обращения. Подписи enum — `common:roles.*`, `clubCategory.*`, `blockType.*`, `knowledgeNodeType.*`, `billing.period.*`.
- `lib/dates.ts` («сегодня, 15:30», «через 2 дня», недели, tz; подписи — из `common:dates.*`; `parseDateOnly`/`formatDateOnly` — дата `YYYY-MM-DD` как локальная, без сдвига через UTC-полночь), `lib/money.ts` (копейки → «1 500 ₽»), `lib/format.ts` (`formatRate`, `formatPercent`, `formatScore`, `fullName`; склонения — через i18n, а не здесь), `lib/navigation.ts` (`FROM_APP_STATE`/`isFromApp` — «Назад» по истории или на корень роли), `lib/parent-paths.ts`, `lib/teacher-paths.ts` (пути, общие для нескольких страниц роли); `api/errors.ts` (`ApiClientError` → текст из `common:errors.codes.*`).
- `config.ts` — `VITE_API_URL`, `VITE_MAX_MODE`, `VITE_AUTH_MODE` (режима моков нет: web всегда ходит в api).

## 6.6. `apps/api/src/common`
- `auth/` — порт `AuthProvider` (`providers/`: `MaxAuthProvider`, `DevAuthProvider`), `JwtService`, `AuthGuard`, `AccessGuard`, `@CurrentUser()`, `@Public()`, `@Roles()`, `@RequirePermission()`.
- `events/` — типизированная шина `DomainEventBus` и декоратор `@OnDomainEvent` (типы из `contracts/events`).
- `queue/` — порт `JobQueue`: `InlineJobQueue` (dev, `QUEUE_DRIVER=inline`) и `BullMqJobQueue` (Redis); обработчики регистрируются через `JobQueue.process(...)`.
- `errors/` (`Errors.*`, `ApiExceptionFilter`), `validation/` (`ZodValidationPipe`), `pagination/` (cursor helpers), `logger/`, `kv/` (`KeyValueStore`), `prisma/`, `time/` (`schoolNow`, границы дня/недели по tz).
- Тестовые помощники — не в `common`, а в `apps/api/test/helpers/` (`env.ts`, `mini-app.ts`, `test-app.ts`).
