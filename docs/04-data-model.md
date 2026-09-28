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
WalletTransactionKind INCOME | WITHDRAWAL
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
- только `updatedAt` — `CourseProgress`, `StudentStatsDaily`, `NotificationSettings`, `ParentStudentLink` (время создания — `requestedAt`), `KvEntry`;
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
Занятия материализуются из правил на 8 недель вперёд (job `schedule.materialize`, ежедневно, идемпотентно по `(ruleId, startsAt)`). Ручные занятия — `ruleId = null`. Реализация — `modules/groups` (`ScheduleMaterializerService`, очередь `schedule`), пока нет отдельного модуля `schedule`:
- правила только активных групп, дни — с сегодняшнего по часам школы (`School.timezone` школы преподавателя группы) на 8 недель, в пределах `validFrom…validTo` включительно;
- занятие из правила создаётся один раз (`createMany` с пропуском дублей по `(ruleId, startsAt)`): повтор ничего не дублирует, отменённое не воскрешает;
- слот пропускается, если у группы уже есть неотменённое занятие, пересекающееся с ним (например, разовое — в том числе плавающие демо-занятия seed'а), — инвариант §4.5 п. 9;
- запуск: HTTP-процесс api (и функция Vercel) ставит job при старте и затем проверяет раз в час; отметка `schedule:materialized:<дата UTC>` в `KeyValueStore` (TTL 26 ч) оставляет одну материализацию в сутки на все процессы и холодные старты, при сбое снимается. Выполняет очередь: inline — сам api, bullmq — worker. При `NODE_ENV=test` сам не запускается (тесты вызывают сервис).
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
                allowedAttempts int?, studentIds uuid[]=[] (адресаты), publishedAt?, deletedAt?
Submission      id PK, assignmentId FK, studentId FK, status SubmissionStatus, attemptsCount int=0,
                score int?, answers json?, fileIds string[], text?, submittedAt?, gradedAt?,
                gradedById FK?, feedback?, isLate bool=false             unique(assignmentId, studentId)
SubmissionAttempt id PK, submissionId FK, n int, answers json, score int?, submittedAt
```
Простое задание преподавателя («до пятницы решить 1–10») — `Assignment(type=HOMEWORK, courseId=null, blockId=null)`. Задание из блока курса — `blockId != null`, создаётся при публикации курса.

`studentIds` — адресаты внутри группы: пустой массив (по умолчанию) означает «всей группе», непустой — задание видят, сдают и считаются в `studentsCount` только перечисленные ученики. Список фиксируется в момент создания и не меняется при изменении состава группы; ученик, убранный из группы (`LEFT`), в `studentsCount`, `submittedCount` и `gradedCount` карточки задания не входит.

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
                target string='COURSE' (COURSE|HOMEWORK), targetCourseId uuid? (Course.id, дополняемый курс),
                studentIds uuid[]=[] (адресаты заданий модуля), dueAt?,
                knowledge json? (KnowledgeBase: atoms, nodes, plan, stats), stage GenerationStage=QUEUED,
                progress int=0, draft json? (CourseDraft), error?, startedAt?, finishedAt?
```
`target` — что собирает задача: `COURSE` (несколько модулей) или `HOMEWORK` (ровно один модуль — одно ДЗ). `targetCourseId` — курс, который задача дополняет; пусто — курс создаётся при `accept`. После `accept` в нём лежит итоговый курс, поэтому повторный `accept` идемпотентен и для задач, дополняющих чужой курс (у них `Course.generationJobId` занят автором курса). Связь не через FK: у `Course` уже есть обратная связь на курс-первоисточник, проверяет её сервис.

### family (`family.prisma`)
```
ParentStudentLink parentId FK, studentId FK, status LinkStatus=ACTIVE, requestedAt, confirmedAt?
                                                                        PK(parentId, studentId)
ParentInvite      token PK, parentId FK, expiresAt, acceptedAt?, acceptedBy?
```
Привязка: ребёнок показывает `linkCode` → родитель вводит → link сразу `ACTIVE` (MVP; подтверждение школой — позже).
Второй способ — ссылка-приглашение (docs/07 F14): родитель создаёт токен (24 случайных байта, base64url, живёт 7 дней), ребёнок открывает ссылку и подтверждает → link `ACTIVE`, `acceptedAt/acceptedBy` заполняются в той же транзакции (условное обновление `acceptedAt IS NULL` — из двух одновременных принятий проходит одно). Ссылка одноразовая: повтор тем же учеником возвращает прежний результат, пока связь `ACTIVE`, другим — `CONFLICT`; уже привязанный к этому родителю ребёнок получает `CONFLICT`, и токен не гасится.

### payments (`payments.prisma`)
```
Payment         id PK, parentId FK, studentId FK, enrollmentId FK, amountKopecks int, currency "RUB",
                status PaymentStatus=PENDING, provider string, providerPaymentId? (unique),
                confirmationUrl?, periodsCount int=1, idempotencyKey (unique), paidAt?, failReason?, raw json?
PaidPeriod      id PK, enrollmentId FK, periodStart date, periodEnd date, paymentId FK
ParentWallet    parentId PK, balanceKopecks int=0, currency "RUB"
TeacherWalletTransaction id PK, teacherId FK, kind WalletTransactionKind, amountKopecks int,
                currency "RUB", groupId? FK, studentId? FK, paymentId? , at
```
«Следующая дата оплаты» = `max(PaidPeriod.periodEnd) + 1 день` для активного enrollment, но не раньше `Enrollment.enrolledAt` (у вернувшегося в группу после ухода старые периоды остаются, а время вне группы не оплачивается); если периодов нет — сегодня.
Платёж создаётся через порт `PaymentProvider` (`fake` в dev, `yookassa` в бою): наш `Payment.id` — ключ идемпотентности у провайдера, статус закрывается вебхуком `POST /webhooks/payments/:provider` или опросом при `GET /parent/payments/:id`; закрытие идемпотентно (обновление статуса и запись `PaidPeriod` — в одной транзакции). Оплаченные периоды продолжают уже оплаченные, а если те истекли — начинаются с сегодняшнего дня.

Кошелёк родителя (`ParentWallet`, `GET /parent/wallet`, `POST /parent/wallet/top-up`) — баланс настоящий, а **пополнение — заглушка**: сумма зачисляется сразу, без оплаты (100 ₽ … 100 000 ₽ за раз, идемпотентно по `Idempotency-Key`). Поэтому ручка работает только при `PAYMENT_PROVIDER=fake`; с настоящим провайдером она отвечает 501 (docs/07 F13).

Кошелёк преподавателя (`TeacherWalletTransaction`, `GET /teacher/wallet`, `POST /teacher/wallet/withdraw`, docs/07 F17) — журнал операций, отдельный от кошелька родителя (у одного пользователя бывают обе роли). Смысл полей:
- `balance` — заработано и не выведено; никогда не отрицательный.
- Операции `TeacherWalletTransaction`, `amount > 0`:
  - `INCOME` — поступление от оплаты кружка учеником группы преподавателя (группа + ученик); создаётся при закрытии платежа. Доли школы и комиссии в модели пока нет: поступление равно сумме оплаты;
  - `WITHDRAWAL` — вывод: от 100 ₽ до баланса, идемпотентно по `Idempotency-Key`; `group = student = null`. Реального перевода нет, поэтому ручка работает только при `PAYMENT_PROVIDER=fake`, иначе 501.
- Период `day | week | month` (по умолчанию `day`) — скользящее окно до «сейчас» (в отличие от календарных окон успеваемости групп в §4.6): `day` — последние 24 часа (в «1 день» попадают и вчерашние вечерние операции, как в макете), `week` — 7 × 24 часа, `month` — 30 × 24 часа. Транзакции — с `at` в `(from, to]`.
- `history` — баланс в равноотстоящих точках окна: `day` — 7 точек через 4 часа, `week` — 8 точек через сутки, `month` — 31 точка через сутки. Первая точка — баланс на `from`, последняя — текущий. Подписи оси X экран строит сам по периоду.
- «Вам должны» (`debts`) — активные `Enrollment` групп преподавателя, у которых следующий платёж уже просрочен или наступит в ближайшие 45 дней. Следующий платёж (`dueAt`) — `max(PaidPeriod.periodEnd) + 1 день`, но не раньше даты зачисления; если оплаченных периодов нет — дата зачисления (долг с начала занятий, то есть просрочено; у родителя в этом случае «следующая дата оплаты» — сегодня, см. выше). Сумма — `Club.priceKopecks`, порядок — по `dueAt`.

Осталось до полноценных выплат (workstream I): доля школы в поступлении и вывод со статусом через провайдера — сейчас `WITHDRAWAL` списывает баланс сразу и никуда не переводит.

### notifications + support + audit (`notifications.prisma`, `support.prisma`, `base.prisma`)
```
Notification    id PK, userId FK, type NotificationType, title, body?, payload json?, readAt?
NotificationSettings userId PK, lessons bool, assignments bool, grades bool, attendance bool,
                insights bool, payments bool                              (все по умолчанию true)
SupportTicket   id PK, userId FK, subject, message, status TicketStatus=OPEN
AuditLog        id PK, actorUserId FK, action, entityType, entityId, diff json?
```

### kv (`kv.prisma`) — владелец core
```
KvEntry         key PK (строка, не uuid), value json, expiresAt?, updatedAt
```
Хранилище порта `KeyValueStore` (`apps/api/src/common/kv`) при `KV_DRIVER=postgres`: идемпотентность, дневные лимиты, кэш контекста, отметка ежедневной материализации расписания, общие для всех инстансов serverless (ADR-014). Запись с прошедшим `expiresAt` не читается; протухшие удаляются по случаю при записи. При `KV_DRIVER=memory` таблица пустует. Ни один модуль не читает её напрямую — только через порт.

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
kv_entries              (expiresAt)                       // key — PK
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
- **Выполнение заданий** `completionRate = doneOnTime / due`. `due` — задания с `dueAt` в периоде (или без `dueAt`, но опубликованные в периоде), срок (публикация) которых не раньше зачисления ученика в группу (`Enrollment.enrolledAt <= dueAt`), `doneOnTime` — `SUBMITTED|GRADED` и `!isLate`. Отдельно `lateCount`. Нет `due` → `null`.
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
