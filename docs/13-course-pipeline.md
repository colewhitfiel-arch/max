# 13. Пайплайн course-builder: материал → атомы → узлы знаний → уроки

Реализация workstream G на GigaChat. Заменяет схему «EXTRACT → OUTLINE → GENERATE» из
`02-architecture.md` §2.7 в части того, *что* делает каждая стадия; стадии `GenerationStage`,
контракт `course-builder.ts` и ручки не изменились. Принципы взяты из StudyMate
(см. `studymate-kit`, ADR про атомы и проверку цитат) и адаптированы под 9 типов блоков курса.

## Два режима запуска

| Режим | Тело `POST /teacher/course-builder/jobs` | Откуда текст |
|---|---|---|
| `MATERIALS` | `materialIds: Id[]` (файлы purpose=MATERIAL, подтверждённые) | `files` извлекает текст: txt/md как есть, pdf — `pdf-parse`, docx — `mammoth`; pptx — пока `NOT_IMPLEMENTED` |
| `TOPIC` | `topic: string` (10–4000 символов): тема, программа занятия или описание практики | Модель пишет конспект (`course-builder.material-from-topic@1`), он идёт по тому же пайплайну |

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
OUTLINING    windowAtoms(atoms, 9000 симв.) → survey на каждое окно ПАРАЛЛЕЛЬНО (COURSE_BUILDER_MAX_PARALLEL)
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
