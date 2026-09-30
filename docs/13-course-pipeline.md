# 13. Пайплайн course-builder: материал → атомы → узлы знаний → уроки

Реализация workstream G на GigaChat. Заменяет схему «EXTRACT → OUTLINE → GENERATE» из
`02-architecture.md` §2.7 в части того, *что* делает каждая стадия; стадии `GenerationStage`,
контракт `course-builder.ts` и ручки не изменились. Принципы взяты из StudyMate
(см. `studymate-kit`, ADR про атомы и проверку цитат) и адаптированы под 9 типов блоков курса.

## Два режима запуска

| Режим | Тело `POST /teacher/course-builder/jobs` | Откуда текст |
|---|---|---|
| `MATERIALS` | `materialIds: Id[]` (файлы purpose=MATERIAL, подтверждённые) | `files` извлекает текст: txt/md как есть, pdf — `pdf-parse`, docx — `mammoth`; pptx — пока `NOT_IMPLEMENTED` |
| `TOPIC` | `topic: string` (10–4000 символов): тема, программа занятия или описание практики | Модель пишет конспект (`course-builder.material-from-topic@2`), он идёт по тому же пайплайну |

Если заданы и файлы, и `topic` — режим `MATERIALS`, текст темы добавляется атомами преподавателя.
Хотя бы одно из двух обязательно (`refine` в контракте).

## Две цели: курс и одно ДЗ

`target` задаёт, что собирается, и не влияет на стадии — только на планировщик и на то, что происходит при `accept`.

| `target` | Планировщик | `accept` |
|---|---|---|
| `COURSE` (по умолчанию) | `planModules` как обычно: 3–5 узлов на модуль, ≤ 8 модулей | новый `Course(DRAFT)`; если задан `targetCourseId` — модули дописываются в конец курса |
| `HOMEWORK` | `planModules(..., { maxModules: 1, minPerModule: 1 })` — ровно один модуль: для ученика это одно занятие в курсе, а не новый курс | то же + модуль публикуется сразу: блоки-задания становятся `Assignment` с `dueAt` и `studentIds` задачи |

`targetCourseId` — курс той же группы и того же преподавателя, не архивный (`CoursesService.assertAppendable`).
Дополнение уже опубликованного курса публикуется сразу и при `target=COURSE`: иначе новых модулей не увидит ни один ученик.
Публикация (`CoursesService.publishCourse`) идемпотентна по `blockId`, поэтому курс можно дополнять сколько угодно раз —
задания создаются только для новых блоков. `accept` тоже идемпотентен: итоговый курс запоминается в `targetCourseId`
(для дополняющих задач `Course.generationJobId` занят автором курса и связи с результатом иначе не было бы).

## Стадии (`apps/api/src/modules/course-builder/pipeline`)

```
QUEUED
  │  create → JobQueue 'course-builder' / 'generate' (jobId = id задачи, идемпотентно)
  ▼
EXTRACTING   files.extractMaterialText(fileId) | generator.writeMaterial(topic)
  │          atomize(text): абзац/пункт списка/группа предложений → KnowledgeAtom { id, text, source }
  │          заголовки приклеиваются к следующему абзацу; куски < 40 симв. склеиваются, > 600 — режутся по предложениям
  ▼
OUTLINING    windowAtoms(atoms, 9000 симв.) → survey на каждое окно ПАРАЛЛЕЛЬНО (COURSE_BUILDER_MAX_PARALLEL,
  │          но не больше GIGACHAT_MAX_CONCURRENCY одновременных запросов — семафор в провайдере)
  │          модель получает «[N] текст» и возвращает узлы с atomIds — только номера, не текст
  │          verifySurvey: несуществующие номера отбрасываются, узел без улик — отклоняется,
  │          дубли по названию сливаются, порядок — по первому процитированному атому
  │          planModules (без модели): 3–5 узлов на модуль, ≤ 8 модулей, при избытке — по importance
  │          ⇒ KnowledgeBase { atoms, nodes, plan, stats } сохраняется в job.knowledge
  ▼
GENERATING   на каждый модуль ПАРАЛЛЕЛЬНО: lessonPrompt(узлы + их атомы-улики) → LessonResult
  │          draft-mapper: TEXT / QUIZ (id вариантов, passScore=60 — код) / FILL_GAPS, FLASHCARDS →
  │          INTERACTIVE / PRACTICE / HOMEWORK / QUESTION; невалидные вопросы и пропуски выкидываются
  ▼
ASSEMBLING   CourseDraftSchema.parse — draft, title = targetTitle ?? заголовок материала ?? первый модуль
  ▼
READY        событие generation.finished; PUT draft → правки; POST accept → createFromDraft (новый курс)
             или appendFromDraft (targetCourseId) → при HOMEWORK сразу publishCourse → Assignment на блоки
```

Отмена (`POST .../cancel`) проверяется между стадиями. Ошибка любой стадии → `FAILED` с текстом
ошибки в `job.error` и событием `generation.finished { stage: 'FAILED' }`. Задача «в работе» без
прогресса дольше `COURSE_BUILDER_STALE_AFTER_SEC` (по умолчанию 30 мин; на Vercel ~360 с — чуть больше
`maxDuration` функции) считается оборванной и тоже уходит в `FAILED`: это делает сторож по таймеру
и, независимо от него, чтение задачи (`GET` задачи и списка) — на serverless таймер не срабатывает.

## Инварианты

- Модель цитирует **номера атомов**; текст урока пишется только по узлам с подтверждёнными цитатами.
  `knowledge.stats.coverage` — доля атомов источника, на которые сослался хотя бы один узел.
- Ответ модели — только payload (схемы в `packages/ai/src/prompts/course-builder.ts`);
  идентификаторы, `passScore`, `estimatedMinutes`, `isRequired` проставляет код.
- Промпты версионируются (`id@version`), в `AiMessage`/логах — только `promptId` и размеры.
- `AI_PROVIDER=mock` проходит весь пайплайн детерминированно (`productMockRules` в `@edu/ai`) —
  на этом построены интеграционные тесты `apps/api/test/course-builder`.

## Данные

`CourseGenerationJob` (`course-builder.prisma`, миграции `20260921180000_course_builder_topic_knowledge`
и `20260923120000_homework_targets_and_generation_target`): `sourceKind` (`MATERIALS|TOPIC`, строка),
`topic`, `knowledge` (json `KnowledgeBase`), `target` (`COURSE|HOMEWORK`, строка), `targetCourseId`,
`studentIds`, `dueAt`. DTO задачи (`GenerationJobDto`) отдаёт их клиенту; в списке задач `draft`
и `knowledge` опущены.

## Ревью, публикация и прохождение (клиент)

- Ревью черновика — блоки раскрываются с содержимым и ответами (`entities/course` `BlockPreview`); «Опубликовать
  для группы» = `accept` + `publish` без параметров (`entities/generation` `usePublishGeneratedCourse`), «Сохранить
  черновиком» = только `accept`. Экран курса преподавателя — публикация черновика, архив, «Прогресс учеников».
- Ученик проходит курс в плеере (`widgets/course-player`): материал засчитывается «Дальше», интерактив (карточки,
  пары, пропуски) проверяется на клиенте, тест — сдачей задания с автопроверкой сразу (`CoursesEvents` →
  `AssignmentsService.autoGrade`) и разбором попытки (`quizReview`). Сценарий — docs/07 F3, F8.
- Пример конспекта для проверки без своих файлов — `apps/web/src/features/upload-file/samples/arduino-distance.md`
  («Взять пример конспекта»; им же пользуется демо-тур, docs/07 F20).
- Файлы на serverless-стенде — `STORAGE_DRIVER=postgres` (ADR-015): загрузка и извлечение текста работают
  между инстансами функции.

## Что дальше (не сделано)

- Редакторы блоков черновика на клиенте (9 типов) — сейчас ревью read-only + `PUT draft` доступен в API.
- Промпт урока один и тот же для курса и для ДЗ (`course-builder.block@2`): для ДЗ он получает
  `position = { index: 0, total: 1 }`, но отдельной «домашней» формулировки у него нет.
- pptx и изображения (OCR) — `NOT_IMPLEMENTED`.
- S3-адаптер хранилища (`S3Storage`) остаётся заглушкой; локальный драйвер работает end-to-end.

## Лимиты GigaChat

Персональный тариф (`GIGACHAT_API_PERS`) принимает **один запрос за раз**: второй параллельный получает
HTTP 429 сразу. Поэтому `GigaChatProvider` держит семафор `GIGACHAT_MAX_CONCURRENCY` (по умолчанию 1):
`COURSE_BUILDER_MAX_PARALLEL` задаёт, сколько окон/уроков готовится одновременно, а реальные запросы к модели
выстраиваются в очередь. На B2B/CORP-тарифе поднимите `GIGACHAT_MAX_CONCURRENCY`. Стрим тьютора занимает слот
до конца ответа, так что во время генерации курса тьютор ждёт очереди.

При 429 без `Retry-After` пауза не меньше 2 с × 2^attempt (до `retryMaxDelayMs`, 20 с), ретраев — `GIGACHAT_MAX_RETRIES`.
`mapLimit` после первой ошибки не стартует новые элементы; поздний отчёт прогресса уже завершённой (FAILED/CANCELLED)
задачи игнорируется, чтобы не «воскрешать» её в GENERATING.

## Что код чинит за моделью (проверено на живом GigaChat-2, 2026-09-21)

- Блоки урока валидируются по одному (`LessonResultSchema`): блок без вопросов/текста или с неизвестным `kind`
  выбрасывается, урок из оставшихся собирается; пустой `title` заменяется на дефолт по виду блока (`draft-mapper`).
- Префиксы «Блок 1.» в заголовках срезаются; в `FILL_GAPS` убирается жирность вокруг пропусков, а предложения
  с заглушкой `{{ответ}}` вместо слова — выкидываются (`normalizeGapsText`).
- Конспект по теме (`material-from-topic@2`) — только предметное содержание: разделы «цели урока», «рефлексия»,
  «домашнее задание» запрещены, иначе из них рождались мусорные модули.
- GigaChat-2 в ~30% ответов теряет или переставляет скобку (`"…"}]` вместо `"…"]}`, пропущенная `}` между
  разделами). `parseJsonResponse` сначала парсит как есть, потом чинит (`fixSwappedClosers` + `jsonrepair`) и
  только после этого переспрашивает модель. Починка логируется как `ai.json.repaired`, невалидная попытка —
  `ai.json.invalid` (путь и сообщение zod, без текста ответа).

- Если модель не написала теорию (меньше 200 символов TEXT), код собирает её сам из узлов модуля и их
  атомов-улик (`theoryFromNodes`) — текст источника, не выдумка.

Качество: `GigaChat-2` (lite, бесплатные токены персонального тарифа) пишет короткие конспекты и уроки и плохо
держит требуемый объём; для продакшена ставьте `GIGACHAT_MODEL=GigaChat-2-Pro` или `GigaChat-2-Max`.

Замер: тема «Arduino для 7 класса» → конспект ~900 токенов, 25 атомов, 11 узлов, покрытие 0.76, 3 модуля, ~45 с,
~19k токенов суммарно (с переспросами по схеме).

