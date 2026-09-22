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
READY        событие generation.finished; PUT draft → правки; POST accept → CoursesService.createFromDraft → Course(DRAFT)
```

Отмена (`POST .../cancel`) проверяется между стадиями. Ошибка любой стадии → `FAILED` с текстом
ошибки в `job.error` и событием `generation.finished { stage: 'FAILED' }`.

## Инварианты

- Модель цитирует **номера атомов**; текст урока пишется только по узлам с подтверждёнными цитатами.
  `knowledge.stats.coverage` — доля атомов источника, на которые сослался хотя бы один узел.
- Ответ модели — только payload (схемы в `packages/ai/src/prompts/course-builder.ts`);
  идентификаторы, `passScore`, `estimatedMinutes`, `isRequired` проставляет код.
- Промпты версионируются (`id@version`), в `AiMessage`/логах — только `promptId` и размеры.
- `AI_PROVIDER=mock` проходит весь пайплайн детерминированно (`productMockRules` в `@edu/ai`) —
  на этом построены интеграционные тесты `apps/api/test/course-builder`.

## Данные

`CourseGenerationJob` (`course-builder.prisma`, миграция `20260921180000_course_builder_topic_knowledge`):
`sourceKind` (`MATERIALS|TOPIC`, строка), `topic`, `knowledge` (json `KnowledgeBase`). DTO задачи
(`GenerationJobDto`) отдаёт их клиенту; в списке задач `draft` и `knowledge` опущены.

## Что дальше (не сделано)

- Редакторы блоков черновика на клиенте (9 типов) — сейчас ревью read-only + `PUT draft` доступен в API.
- pptx и изображения (OCR) — `NOT_IMPLEMENTED`.
- S3-адаптер хранилища (`S3Storage`) остаётся заглушкой; локальный драйвер работает end-to-end.
- Пропуски `FILL_GAPS` и карточки ученику пока не рендерятся (нет блока INTERACTIVE в плеере курса — workstream B).

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

