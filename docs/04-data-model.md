# 4. Модель данных

Центральный объект — `StudentProfile`. Всё остальное либо принадлежит ученику, либо связано с ним через `Enrollment` (группа) или `ParentStudentLink` (родитель).

Схема хранится в `packages/db/prisma/schema/*.prisma`, по файлу на модуль. Здесь — логическая модель; Prisma-файлы должны соответствовать ей 1:1. Изменение модели — сначала здесь, потом в схеме (см. `10-ownership.md`).

## 4.1. Enum'ы (`packages/contracts/src/enums.ts` — те же значения)

```
Role                 STUDENT | PARENT | TEACHER | SCHOOL_ADMIN   // SCHOOL_ADMIN зарезервирован
Locale               ru | en
Theme                SYSTEM | LIGHT | DARK
LinkStatus           PENDING | ACTIVE | REVOKED
EnrollmentStatus     ACTIVE | PAUSED | LEFT
LessonStatus         PLANNED | DONE | CANCELLED
AttendanceStatus     PRESENT | ABSENT | LATE | EXCUSED
CourseStatus         DRAFT | PUBLISHED | ARCHIVED
BlockType            TEXT | VIDEO | IMAGE | FILE | QUIZ | QUESTION | PRACTICE | HOMEWORK | INTERACTIVE
AssignmentType       HOMEWORK | QUIZ | QUESTION | PRACTICE
SubmissionStatus     NOT_STARTED | IN_PROGRESS | SUBMITTED | GRADED | RETURNED
BlockProgressStatus  OPENED | COMPLETED
FileStatus           UPLOADED | EXTRACTING | EXTRACTED | FAILED
GenerationStage      QUEUED | EXTRACTING | OUTLINING | GENERATING | ASSEMBLING | READY | ACCEPTED | FAILED | CANCELLED
ConversationKind     ONBOARDING | TUTOR
MessageRole          USER | ASSISTANT | SYSTEM
InsightKind          STUDENT_HOME_COMMENT | PARENT_SUMMARY | TEACHER_STUDENT_SUMMARY
PaymentStatus        PENDING | SUCCEEDED | FAILED | CANCELLED | REFUNDED
BillingPeriod        MONTH
FilePurpose          MATERIAL | SUBMISSION | BLOCK_MEDIA | AVATAR
NotificationType     LESSON_SOON | LESSON_CANCELLED | ASSIGNMENT_NEW | ASSIGNMENT_DUE | ASSIGNMENT_GRADED |
                     ATTENDANCE_ABSENT | SUBMISSION_RECEIVED | COURSE_PUBLISHED | PAYMENT_DUE |
                     PAYMENT_SUCCEEDED | GENERATION_DONE | INSIGHT_READY
ActivityType         APP_OPENED | BLOCK_OPENED | BLOCK_COMPLETED | SUBMISSION_SUBMITTED | LESSON_ATTENDED | TUTOR_MESSAGE
TicketStatus         OPEN | ANSWERED | CLOSED
ClubCategory         ROBOTICS | PROGRAMMING | LANGUAGES | CHESS | MATH | ART | MUSIC | SPORT | SCIENCE | OTHER
ClubInterestStatus   CHOSEN | LATER | SKIPPED                         // в contracts — ClubInterestStatusSchema в routes/ai.ts (не в enums.ts)
```

## 4.2. Сущности

Обозначения: `PK` — id (uuid v7), `FK` — ссылка, `?` — nullable, `[]` — массив, `json` — jsonb со схемой в contracts. У всех таблиц есть `createdAt`, `updatedAt`, если не сказано иное. Исключения (как в схеме):
- только `createdAt` — `UserRole`, `RefreshToken`, `AiMessage`, `PaidPeriod`, `Notification`, `AuditLog`;
- только `updatedAt` — `CourseProgress`, `StudentStatsDaily`, `NotificationSettings`, `ParentStudentLink` (время создания — `requestedAt`);
- без обоих — `ActivityEvent` (`occurredAt`), `SubmissionAttempt` (`submittedAt`), `AiInsight`, `Trajectory` (`generatedAt`).

Индексы, кроме PK и `unique`, перечислены в §4.2.1.

### identity (`identity.prisma`)
```
User            id PK, maxUserId (unique), firstName, lastName?, nickname?, avatarUrl?,
                locale Locale=ru, theme Theme=SYSTEM, lastSeenAt?
UserRole        userId FK, role Role                                    PK(userId, role)
StudentProfile  id PK, userId FK unique, schoolId FK?, classLabel? ("7Б"), birthYear?,
                interests string[], goals string[], weeklyHours int?, preferredFormats string[],
                futureInterests string[],        // «хочу попробовать позже» из онбординга — спрос на будущее
                aiProfileSummary text?,          // итог онбординга, входит в StudentContext
                onboardingCompletedAt?, linkCode (unique, 6 символов, ротация по запросу)
ParentProfile   id PK, userId FK unique
TeacherProfile  id PK, userId FK unique, schoolId FK, qualification?, bio?, photoUrl?,
                contactPhone?, contactEmail?, contactsVisible bool=false
RefreshToken    id PK, userId FK, tokenHash (unique), activeRole Role? (восстанавливается при refresh),
                expiresAt, revokedAt?
```
`User.avatarUrl` — ссылка из провайдера (MAX), перезаписывается при каждом входе. Своё фото пользователя (`PUT /me/avatar`) пока не хранится: ручка отвечает 501. **Планируется** `User.avatarFileId?` (файл purpose `AVATAR`; в `MeDto`/`UserBrief` — свежая подписанная ссылка), тогда вход не будет затирать выбранное фото (docs/12, техдолг).

### school (`school.prisma`)
```
School          id PK, name, timezone (IANA, "Europe/Moscow"), inviteCode (unique, для преподавателей),
                settings json { showTeacherContacts: bool }
```

### catalog (`catalog.prisma`)
```
Club            id PK, schoolId FK, title, description, category ClubCategory, coverUrl?,
                priceKopecks int, billingPeriod BillingPeriod=MONTH, isActive bool=true,
                tags string[]                    // для подбора ИИ
```

### groups + schedule (`groups.prisma`)
```
Group           id PK, clubId FK, teacherId FK(TeacherProfile), title, isActive bool=true
Enrollment      id PK, studentId FK, groupId FK, status EnrollmentStatus=ACTIVE, enrolledAt, leftAt?
                                                                        unique(studentId, groupId)
ScheduleRule    id PK, groupId FK, weekday 0..6, startTime "HH:mm", endTime "HH:mm", room?,
                validFrom date, validTo date?
Lesson          id PK, groupId FK, ruleId FK?, startsAt, endsAt, topic?, room?, status LessonStatus=PLANNED,
                cancelReason?                                           unique(ruleId, startsAt)
```
Занятия материализуются worker'ом из правил на 8 недель вперёд (job `schedule.materialize`, ежедневно, идемпотентно по `(ruleId, startsAt)`). Ручные занятия — `ruleId = null`.
**Планируется** `Group.code?` — короткий номер группы («001», 1–16 символов), который преподаватель видит в расписании, успеваемости и кошельке (docs/07 F16–F18). Пока есть только в контракте (`GroupBrief.code`, опционально; нет — UI показывает `title`) и в MSW-моках; поле в `groups.prisma` добавляется вместе с backend-ручками групп (workstream E).

### attendance (`attendance.prisma`)
```
Attendance      id PK, lessonId FK, studentId FK, status AttendanceStatus, comment?,
                markedById FK(TeacherProfile), markedAt                 unique(lessonId, studentId)
```

### courses (`courses.prisma`)
```
Course          id PK, groupId FK, teacherId FK, title, description?, status CourseStatus=DRAFT,
                version int=1, publishedAt?, generationJobId FK? (unique), deletedAt?
CourseModule    id PK, courseId FK, order int, title, summary?
CourseBlock     id PK, moduleId FK, order int, type BlockType, title,
                content json (схема по типу, 4.4), estimatedMinutes int?, isRequired bool=true
BlockProgress   id PK, studentId FK, blockId FK, status BlockProgressStatus, openedAt, completedAt?,
                attempts int=0, score int?                              unique(studentId, blockId)
CourseProgress  studentId FK, courseId FK, completedBlocks int, totalBlocks int, percent int,
                lastActivityAt?                                          PK(studentId, courseId)   // read-model
```

### assignments (`assignments.prisma`)
```
Assignment      id PK, groupId FK, teacherId FK, courseId FK?, blockId FK? (unique), title,
                description? (markdown), type AssignmentType, dueAt?, maxScore int=100,
                allowedAttempts int?, publishedAt?, deletedAt?
Submission      id PK, assignmentId FK, studentId FK, status SubmissionStatus, attemptsCount int=0,
                score int?, answers json?, fileIds string[], text?, submittedAt?, gradedAt?,
                gradedById FK?, feedback?, isLate bool=false             unique(assignmentId, studentId)
SubmissionAttempt id PK, submissionId FK, n int, answers json, score int?, submittedAt
```
Простое задание преподавателя («до пятницы решить 1–10») — `Assignment(type=HOMEWORK, courseId=null, blockId=null)`. Задание из блока курса — `blockId != null`, создаётся при публикации курса.

### analytics (`analytics.prisma`)
```
ActivityEvent   id PK, userId FK, studentId FK?, type ActivityType, entityType?, entityId?,
                meta json?, occurredAt
StudentStatsDaily studentId FK, date, lessonsPlanned int, lessonsAttended int, lessonsLate int,
                lessonsExcused int, assignmentsDue int, assignmentsDoneOnTime int, assignmentsDoneLate int,
                blocksCompleted int, tutorMessages int, appOpens int, activityScore int
                                                                        PK(studentId, date)
```

### ai (`ai.prisma`)
```
AiConversation  id PK, userId FK, studentId FK?, kind ConversationKind, title?,
                contextSnapshot json?, lastMessageAt?
AiMessage       id PK, conversationId FK, role MessageRole, content text, promptId?,
                tokensIn int?, tokensOut int?
AiInsight       id PK, kind InsightKind, studentId FK, periodFrom date, periodTo date,
                content text, promptId, sourceHash, generatedAt, expiresAt
                                                                        unique(kind, studentId, periodFrom, periodTo)
Trajectory      id PK, studentId FK, content json { summary, strengths[], growthAreas[],
                recommendations[{ title, why, clubId?, courseId? }], nextSteps[] },
                promptId, sourceHash, generatedAt
StudentClubInterest id PK, studentId FK, clubId FK, status ClubInterestStatus (CHOSEN | LATER | SKIPPED),
                score? 0..1 (оценка ИИ), reason? (из рекомендации), source "ONBOARDING"
                                                                        unique(studentId, clubId)   // спрос на кружки из онбординга
```

### files + course-builder (`files.prisma`, `course-builder.prisma`)
```
File            id PK, ownerUserId FK, purpose FilePurpose, fileName, mime, sizeBytes, storageKey (unique),
                confirmedAt?, status FileStatus=UPLOADED, extractedTextKey?,
                extractMeta json? { pages, headings[] }, error?
CourseGenerationJob id PK, teacherId FK, groupId FK, materialIds string[] (File.id),
                instructions text?, targetTitle?, sourceKind string='MATERIALS' (MATERIALS|TOPIC), topic text?,
                knowledge json? (KnowledgeBase: atoms, nodes, plan, stats), stage GenerationStage=QUEUED,
                progress int=0, draft json? (CourseDraft), error?, startedAt?, finishedAt?
```

### family (`family.prisma`)
```
ParentStudentLink parentId FK, studentId FK, status LinkStatus=ACTIVE, requestedAt, confirmedAt?
                                                                        PK(parentId, studentId)
```
Привязка: ребёнок показывает `linkCode` → родитель вводит → link сразу `ACTIVE` (MVP; подтверждение школой — позже).
Второй способ — ссылка-приглашение (docs/07 F14): родитель создаёт токен (≥16 символов, живёт 7 дней), ребёнок открывает ссылку и подтверждает → link `ACTIVE`. Пока реализовано только в контракте и MSW-моках; модель (`ParentInvite`: token unique, parentId FK, expiresAt, acceptedById?, acceptedAt?) заводится в `family.prisma` вместе с backend-ручками.

### payments (`payments.prisma`)
```
Payment         id PK, parentId FK, studentId FK, enrollmentId FK, amountKopecks int, currency "RUB",
                status PaymentStatus=PENDING, provider string, providerPaymentId? (unique),
                confirmationUrl?, periodsCount int=1, idempotencyKey (unique), paidAt?, failReason?, raw json?
PaidPeriod      id PK, enrollmentId FK, periodStart date, periodEnd date, paymentId FK
```
«Следующая дата оплаты» = `max(PaidPeriod.periodEnd) + 1 день` для активного enrollment; если периодов нет — сегодня.
Кошелёк родителя (`GET /parent/wallet`, `POST /parent/wallet/top-up`) — **заглушка**: баланс живёт только в MSW-моках, пополнение зачисляется сразу (100 ₽ … 100 000 ₽ за раз, идемпотентно по `Idempotency-Key`), реального провайдера и таблиц нет. Модель (`Wallet`, `WalletTransaction`) появится вместе с `PaymentProvider` (docs/07 F13).

Кошелёк преподавателя (`GET /teacher/wallet`, `POST /teacher/wallet/withdraw`, docs/07 F17) — тоже **заглушка** в MSW-моках, отдельно от кошелька родителя (у одного пользователя бывают обе роли). Смысл полей:
- `balance` — заработано и не выведено; никогда не отрицательный.
- Операции `TeacherWalletTransaction`, `amount > 0`:
  - `INCOME` — поступление от оплаты кружка учеником группы преподавателя (группа + ученик). Доли школы и комиссии в модели пока нет: в заглушке поступление равно сумме оплаты;
  - `WITHDRAWAL` — вывод: от 100 ₽ до баланса, идемпотентно по `Idempotency-Key`; `group = student = null`; реального перевода нет.
- Период `day | week | month` (по умолчанию `day`) — скользящее окно до «сейчас» (в отличие от календарных окон успеваемости групп в §4.6): `day` — последние 24 часа (в «1 день» попадают и вчерашние вечерние операции, как в макете), `week` — 7 × 24 часа, `month` — 30 × 24 часа. Транзакции — с `at` в `(from, to]`.
- `history` — баланс в равноотстоящих точках окна: `day` — 7 точек через 4 часа, `week` — 8 точек через сутки, `month` — 31 точка через сутки. Первая точка — баланс на `from`, последняя — текущий. Подписи оси X экран строит сам по периоду.
- «Вам должны» (`debts`) — активные `Enrollment` групп преподавателя, у которых следующий платёж уже просрочен или наступит в ближайшие 45 дней. Следующий платёж (`dueAt`) — `max(PaidPeriod.periodEnd) + 1 день`; если оплаченных периодов нет — дата зачисления (долг с начала занятий, то есть просрочено; у родителя в этом случае «следующая дата оплаты» — сегодня, см. выше). Сумма — `Club.priceKopecks`, порядок — по `dueAt`.

Модель (журнал операций преподавателя, выводы со статусом, доля преподавателя от оплаты) появится вместе с `PaymentProvider` и выплатами (workstream I). Тогда поступления будут создаваться по событию `payment.succeeded`.
В MSW-моке история кошелька демонстрационная: поступления сгенерированы (не раньше зачисления ученика, сумма — цена кружка) и не связаны с `Payment` один к одному; чтобы «Вам должны» и платежи родителя не спорили с кошельком, зачисление с недавним поступлением оплачено (`Payment` + `PaidPeriod` на 30 дней с дня последнего поступления). Оплата родителя в моке поступления не создаёт — до workstream I.

### notifications + support + audit (`notifications.prisma`, `support.prisma`, `base.prisma`)
```
Notification    id PK, userId FK, type NotificationType, title, body?, payload json?, readAt?
NotificationSettings userId PK, lessons bool, assignments bool, grades bool, attendance bool,
                insights bool, payments bool                              (все по умолчанию true)
SupportTicket   id PK, userId FK, subject, message, status TicketStatus=OPEN
AuditLog        id PK, actorUserId FK, action, entityType, entityId, diff json?
```

### 4.2.1. Индексы

Неуникальные индексы (`@@index` в схеме). Колонки — в порядке индекса; FK покрыт индексом, если он первая колонка.
```
student_profiles        (schoolId)
teacher_profiles        (schoolId)
refresh_tokens          (userId)
clubs                   (schoolId, isActive)
groups                  (teacherId); (clubId)
enrollments             (groupId, status)                 // studentId — первая колонка unique(studentId, groupId)
schedule_rules          (groupId)
lessons                 (groupId, startsAt); (startsAt)
attendance              (studentId, markedAt)             // lessonId — unique(lessonId, studentId)
courses                 (groupId, status); (teacherId)
course_modules          (courseId, order)
course_blocks           (moduleId, order)
block_progress          (blockId)                         // studentId — unique(studentId, blockId)
course_progress         (courseId)                        // studentId — PK(studentId, courseId)
assignments             (groupId, dueAt); (courseId); (teacherId)   // blockId — unique
submissions             (studentId, submittedAt)          // assignmentId — unique(assignmentId, studentId)
activity_events         (studentId, occurredAt); (userId, occurredAt)
ai_conversations        (userId, kind, lastMessageAt); (studentId)
ai_messages             (conversationId, createdAt)
trajectories            (studentId, generatedAt)
student_club_interests  (clubId, status)                  // studentId — unique(studentId, clubId)
course_generation_jobs  (teacherId, createdAt)
parent_student_links    (studentId)                       // parentId — PK(parentId, studentId)
payments                (parentId, createdAt); (studentId); (enrollmentId)
paid_periods            (enrollmentId, periodEnd); (paymentId)
notifications           (userId, createdAt); (userId, readAt)
support_tickets         (userId, createdAt)
audit_logs              (entityType, entityId); (actorUserId, createdAt)
```
FK покрыт, если он первая колонка индекса, `unique` или PK. Сейчас не покрыты: `Attendance.markedById`, `Submission.gradedById`, `CourseGenerationJob.groupId`, `AiInsight.studentId` (в `unique(kind, studentId, …)` он второй) — выборок «все строки по этому FK» нет; индекс добавляется вместе с первой такой выборкой.

## 4.3. Ключевые связи

```
User 1—1 StudentProfile / ParentProfile / TeacherProfile     (у одного User может быть несколько ролей)
ParentProfile N—N StudentProfile   через ParentStudentLink
School 1—N Club 1—N Group N—1 TeacherProfile
Group N—N StudentProfile           через Enrollment
Group 1—N ScheduleRule 1—N Lesson 1—N Attendance N—1 StudentProfile
Group 1—N Course 1—N CourseModule 1—N CourseBlock 1—N BlockProgress
Group 1—N Assignment 1—N Submission 1—N SubmissionAttempt
CourseBlock 1—0..1 Assignment      (блоки-задания)
Enrollment 1—N PaidPeriod; Payment N—1 Enrollment
StudentProfile 1—N ActivityEvent / StudentStatsDaily / AiInsight / Trajectory / AiConversation / StudentClubInterest
```

## 4.4. Схемы `CourseBlock.content` по типу (`packages/contracts/src/blocks/`)

```
TEXT        { markdown: string }
VIDEO       { url?: string, provider: 'youtube'|'vk'|'rutube'|'file', fileId?: string, durationSec?: number }
IMAGE       { fileId: string, caption?: string }
FILE        { fileId: string, description?: string }
QUIZ        { questions: [{ id, text, options: [{ id, text }], correctOptionIds: string[], explanation?, multiple: boolean }],
              passScore: number }                                        // автопроверка
QUESTION    { prompt: string, expectedAnswer?: string, rubric?: string }  // открытый ответ, проверяет преподаватель
PRACTICE    { instructions: string, submissionType: 'TEXT'|'FILE'|'BOTH' }
HOMEWORK    { instructions: string, submissionType: 'TEXT'|'FILE'|'BOTH'|'NONE' }
INTERACTIVE { kind: 'FLASHCARDS'|'MATCHING'|'FILL_GAPS', data: <схема по kind> }
```
`Submission.answers`: для QUIZ — `{ [questionId]: optionId[] }`; для остальных — `{ text?, fileIds? }`. Ученику QUIZ отдаётся без `correctOptionIds` и `explanation` до завершения попытки.

## 4.5. Инварианты и правила доступа

1. Ученик видит: свои `Enrollment(ACTIVE|PAUSED)` → их группы, занятия, курсы (`PUBLISHED`), задания (`publishedAt != null`).
2. Родитель видит только детей с `ParentStudentLink.status = ACTIVE` и всё то же, что видит ребёнок, плюс платежи. Не видит содержимое чата тьютора.
3. Преподаватель видит только группы, где `Group.teacherId = его профиль`, и учеников этих групп.
4. Отметить посещаемость можно только для занятий своей группы и только для учеников, зачисленных в неё.
5. `Submission` уникальна на пару (assignment, student); попытки — в `SubmissionAttempt`; `attemptsCount <= allowedAttempts`.
6. `isLate = submittedAt > dueAt` (если `dueAt` задан) — фиксируется при сдаче, не пересчитывается.
7. После публикации структура курса заморожена (в MVP): менять можно только тексты блоков. Правки структуры → `ARCHIVED` + новый курс.
8. Удаления — мягкие (`deletedAt`) только для `Course`/`Assignment`; остальное — через статусы.
9. `Lesson.startsAt < endsAt`; занятия одной группы не пересекаются.
10. `Payment.amountKopecks = Club.priceKopecks * periodsCount` на момент создания (цена фиксируется в платеже).

## 4.6. Формулы аналитики (считает только `analytics`, единые для всех ролей)

Период по умолчанию — 30 дней; фронт может передать `from/to`.

- **Посещаемость** `attendanceRate = attended / countable`. `countable` — занятия со статусом `DONE` в периоде, на которые ученик был зачислен (`Enrollment.enrolledAt <= lesson.startsAt`), минус `EXCUSED`. `attended` — `PRESENT | LATE`. Нет `countable` → `null`.
- **Пропуски** `absences = count(ABSENT)`.
- **Выполнение заданий** `completionRate = doneOnTime / due`. `due` — задания с `dueAt` в периоде (или без `dueAt`, но опубликованные в периоде), `doneOnTime` — `SUBMITTED|GRADED` и `!isLate`. Отдельно `lateCount`. Нет `due` → `null`.
- **Активность** `activityScore` (0–100) за неделю: `min(100, 10*blocksCompleted + 15*submissions + 5*lessonsAttended + 2*tutorMessages + 1*appOpens)`. Отображается как «низкая (<30) / средняя / высокая (≥70)» + число. Формула — одна (`apps/api/src/modules/analytics/metrics.ts`), окно выбирает вызывающий. **Исключение:** снимок ученика для ИИ (`StudentContext.stats30d`, `modules/ai/context-builder.ts`) считает её за 30 дней и без `appOpens` (событий открытия приложения в снимке нет) — осознанное расхождение с недельным окном экранов.
- **Прогресс по кружку** `clubProgress = avg(CourseProgress.percent по PUBLISHED курсам группы)`; если курсов нет — `completionRate` по заданиям группы.
- **Динамика** — те же метрики по неделям из `StudentStatsDaily`; `trend` = разница с предыдущим периодом такой же длины.
- **Серия** `streakDays` (огонёк на главной ученика): действие — посещение занятия (`PRESENT | LATE`) или сданное задание (`submittedAt`). Действие нужно хотя бы раз в 2 дня: между днями с действием допускается один пустой день, два пустых подряд — серия сгорает. Значение — календарные дни от первого дня текущей серии до последнего дня с действием включительно (пн, ср, пт → 5). Серия жива, пока с последнего действия прошло ≤ 2 дней (сегодня ещё можно успеть), иначе `0`. Дни — в поясе школы.
- **Кристаллы** `points` (валюта на главной и в «Заданиях»): `50 × посещения (PRESENT | LATE) + 20 × правильно выполненные задания`. Задание выполнено правильно, если `score / maxScore > 0.75` (ровно 75% — нет); одно задание засчитывается один раз (лучшая попытка). Трат пока нет — это заработанная сумма. Реализация — `apps/api/src/modules/analytics/gamification.ts` (+ тесты).
- **Статус задания для родителя** (`HomeworkTaskStatus`, клетки на экране аналитики), порог 72 ч от «сейчас»:
  - `DONE` (зелёный) — сдано и (ещё не проверено или `score / maxScore ≥ 0.3`);
  - `FAILED` (красный) — проверено и `score / maxScore < 0.3`, **или** дедлайн прошёл, а сдачи нет;
  - `SOON` (жёлтый) — не сдано, дедлайн в ближайшие 72 ч;
  - `LATER` (серый) — не сдано, дедлайн дальше 72 ч или его нет.
  Учитывается лучшая попытка. Итоги `HomeworkCounts`: `correct = DONE`, `wrong = FAILED`, `upcoming = SOON + LATER`. `number` — порядковый номер задания в группе (по `dueAt`, затем по публикации), с 1; `scorePercent = round(100 × score / maxScore)` или `null`.
  **У ученика** (профиль, `StudentProfileDto.homework` / `clubHomework`) те же статусы, но «правильно» — как у кристаллов: `DONE` — сдано и (ещё не проверено или `score / maxScore > 0.75`), `FAILED` — проверено и `score / maxScore ≤ 0.75` или дедлайн прошёл без сдачи. Порог родителя (30%) не меняется.
  **У преподавателя** (`TeacherStudentCard.homework` / `clubHomework`, `GET /teacher/students/:id/groups/:groupId/tasks`, счётчики успеваемости групп ниже) — статусы и порог родителя: `FAILED` при `score / maxScore < 0.3`. Считаются только группы этого преподавателя.
- **Выполненные задания за окно** (`GET /parent/children/:id/homework-progress?days=1|7|30`, по умолчанию 7) по каждой группе ребёнка: `done` — задания группы, сданные (`submittedAt`) за последние `days` дней; `recommended` — задания группы с `dueAt` в том же окне (число со «*», может быть 0). Размер кружка на главной родителя: `ratio = recommended > 0 ? min(done / recommended, 1) : (done > 0 ? 1 : 0)`, чем больше `ratio`, тем кружок меньше (визуальное правило фронта).
- **Успеваемость групп преподавателя** (`GET /teacher/performance?period=day|week|month|course`, по умолчанию `day`) — строка на каждую активную группу преподавателя.
  - Периоды (в поясе школы, до «сейчас»; `from/to` приходят в ответе):
    - `day` — с начала сегодняшнего дня;
    - `week` — 7 календарных дней, включая сегодняшний;
    - `month` — 30 календарных дней, включая сегодняшний;
    - `course` — с 1 сентября текущего учебного года (до 1 сентября — с 1 сентября прошлого года).
  - `studentsCount` — зачисления группы в статусе `ACTIVE`.
  - `attended` — отметки `PRESENT | LATE` на занятиях группы в периоде, которые уже начались и не отменены; `missed` — `ABSENT | EXCUSED` на тех же занятиях. Неотмеченные занятия не входят ни в один счётчик. `attended + missed` — высота столбца «Посещения».
  - `homeworkDone` — сдачи по заданиям группы с `dueAt` в календарных днях периода (включая сегодняшние задания со сроком позже «сейчас»): пары задание × ученик, у которых есть сдача (лучшая попытка, статус `DONE` или проверенный `FAILED`).
  - `homeworkCorrect` — сдачи из `homeworkDone` со статусом `DONE` по порогу преподавателя (≥ 30% или ещё не проверено), поэтому `homeworkCorrect ≤ homeworkDone`.
- **Требуют внимания** (для преподавателя, с причинами): `attendanceRate < 0.7` за 30 дней; ≥2 просроченных сдачи подряд; 14 дней без `ActivityEvent`; средний балл < 50% по последним 3 проверенным.
