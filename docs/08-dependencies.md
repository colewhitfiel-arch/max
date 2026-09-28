# 8. Зависимости между модулями

## 8.1. Слои (зависимость только вниз)

```
5. Оркестрация        course-builder
                          │ (ai, courses, files, groups)
4. Производные        analytics ─── ai ─── notifications
                          │ читают read-only сервисы слоёв 1–3, слушают события всех
3. Учебный процесс    attendance   courses ──▶ assignments   payments
                          │            │           │            │ (family, groups)
2. Учебная структура  catalog ◀── groups(+schedule)      family
                          │            │                    │
1. Ядро               school      identity               files
```

Стрелка = «использует публичный сервис». Запрещены зависимости вверх и циклы. Единственная горизонтальная связь в слое 3 — `courses → assignments` (создание/сдача заданий из блоков); обратной нет.

**Известные исключения (техдолг, docs/12 «Ревью 2026-09-23»):**
- `identity → family` (зависимость вверх, слой 1 → 2): `IdentityService` при сборке `MeDto` вызывает `FamilyService.countChildren(parentId)` — только чтение (`parent.childrenCount` в `/me`). Исправление — собирать `/me` выше identity (фасад на уровне app или family) и убрать `FamilyModule` из импортов `IdentityModule`; до этого новых вызовов из identity в модули выше не добавлять.
- `ai` читает чужие таблицы напрямую (временно, до публикации read-методов в identity/groups/courses/assignments/attendance): `StudentContextBuilder` (`modules/ai/context-builder.ts`) — `student_profiles`, `enrollments`, `lessons` (+ `attendance`), `assignments` (+ `submissions`), `course_progress`, `block_progress`; `AiRepository.futureInterestsOfSchool` — `student_profiles`. Формулы при этом берутся из `modules/analytics/metrics.ts`. Когда модули опубликуют read-сервисы из §8.3, эти чтения переводятся на них.

## 8.2. Матрица «кто кого вызывает»

| Модуль | Использует сервисы | Слушает события |
|---|---|---|
| identity | school (inviteCode), family (`countChildren` — исключение, §8.1) | — |
| school | — | — |
| catalog | school, identity (TeacherBrief) | — |
| groups | catalog, identity, school (tz) | — |
| family | identity | — |
| attendance | groups, identity | — |
| courses | groups, assignments, files | — |
| assignments | groups, files | `course.published` |
| payments | family, groups, catalog | — |
| files | — | — |
| analytics | identity, groups, attendance, assignments, courses, family, catalog | все учебные события, `app.opened`, `tutor.message.sent` |
| notifications | identity, family, groups | все события |
| ai | identity, catalog, groups, attendance, assignments, courses, analytics (пока часть — прямыми чтениями в context-builder, §8.1) | `attendance.marked`, `submission.*`, `block.completed`, `student.profile.updated` (инвалидация) |
| course-builder | ai (LlmProvider), files, courses, groups | — |
| support | identity | — |

## 8.3. Публичные интерфейсы (что другие модули могут вызывать)

| Модуль | Публичный сервис |
|---|---|
| identity | `getUser(id)`, `getStudentProfile(id)`, `getTeacherProfile(id)`, `getParentProfile(id)`, `findStudentByLinkCode(code)`, `briefs(userIds)`, `listStudentIdsOfSchool(schoolId)` (кандидаты в группы преподавателя) |
| school | `getSchool(id)`, `getSettings(id)`, `timezone(schoolId)` |
| catalog | `getClub(id)`, `listClubs(schoolId?)`, `clubBriefs(ids)`, `teacherCard(teacherId, viewerRole)` |
| groups | `getGroup(id)`, `groupBrief(id)`, `listGroupsByTeacher(teacherId)`, `listStudentIdsInGroup(groupId)`, `listEnrollments(studentId)`, `isEnrolled(studentId, groupId)`, `listLessons({ groupIds \| studentId, from, to })`, `getLesson(id)`, `getEnrollment(id)` |
| attendance | `listByStudent(studentId, period)`, `listByLesson(lessonId)`, `countable(studentId, period)` |
| courses | `listPublishedByGroups(groupIds)`, `getProgress(studentId, courseId)`, `listCourseProgress(studentId)`, `blockBrief(id)` |
| assignments | `listForStudent(studentId, filter)`, `listForGroup(groupId, filter)`, `createFromBlocks(event)`, `submitFromBlock(studentId, blockId, answers)`, `listSubmissions(studentId, period)` |
| family | `listChildren(parentId)`, `assertParentLinked(parentId, studentId)`, `listParentsOf(studentId)`, `countChildren(parentId)` |
| analytics | `getStudentStats(studentId, period)`, `getWeekly(studentId, period)`, `getClubProgress(studentId)`, `getNeedsAttention(groupId)`, `recordActivity(event)` |
| ai | `getInsight(kind, studentId)`, `buildStudentContext(studentId)`, `enqueueInsightRefresh(studentId)`, `invalidate(studentId)` |
| files | `createUploadUrl(...)`, `confirm(id)`, `getSignedUrl(id)`, `fileDtos(ids)`, `readExtractedText(id)`, `enqueueExtract(id)` |
| payments | `getPaidUntil(enrollmentId)`, `listPayments(parentId, studentId)` |
| notifications | `notify(userIds, type, payload)` |

Дашборды (`/student/home`, `/parent/.../home|analytics`, `/teacher/home|groups|students/:id`) живут в `analytics/dashboards`, потому что этот модуль уже зависит от всех учебных модулей.

## 8.4. Frontend-зависимости

- `pages/*` → `widgets/*` → `features/*` → `entities/*` → `shared/*` → `packages/ui`, `packages/contracts`. Только вниз.
- `entities/<x>` не импортирует `entities/<y>`; композиция — в `widgets`.
- Все запросы — через хуки в `entities/<x>/api.ts`; ключи — `entities/<x>/keys.ts` с префиксами из `shared/api/query-keys.ts`.
- Роль-специфичные страницы не импортируют страницы другой роли. Общее — в `widgets`/`entities`.

## 8.5. Внешние зависимости и заглушки

| Внешняя система | Порт | Реальный адаптер | Заглушка (dev/test) |
|---|---|---|---|
| MAX (auth, bridge) | `MaxAuthProvider`, `MaxBridge` | по dev.max.ru (I2) | `DevAuthProvider`, `mock bridge` |
| GigaChat | `LlmProvider` | `GigaChatProvider` | `FakeLlmProvider` (детерминированные ответы по promptId) |
| Платежи | `PaymentProvider` | `YooKassaProvider` | `FakePaymentProvider` (ручной успех/провал) |
| S3 | `StorageProvider` | AWS SDK v3 | MinIO в docker |
| OCR | `OcrProvider` | позже | `NoopOcrProvider` |
