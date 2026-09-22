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
MaterialStatus       UPLOADED | EXTRACTING | EXTRACTED | FAILED
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
```

## 4.2. Сущности

Обозначения: `PK` — id (uuid v7), `FK` — ссылка, `?` — nullable, `[]` — массив, `json` — jsonb со схемой в contracts. У всех таблиц есть `createdAt`, `updatedAt`, если не сказано иное.

### identity (`identity.prisma`)
```
User            id PK, maxUserId (unique), firstName, lastName?, nickname?, avatarUrl?,
                locale Locale=ru, theme Theme=SYSTEM, lastSeenAt?
UserRole        userId FK, role Role                                    unique(userId, role)
StudentProfile  id PK, userId FK unique, schoolId FK?, classLabel? ("7Б"), birthYear?,
                interests string[], goals string[], weeklyHours int?, preferredFormats string[],
                futureInterests string[],        // «хочу попробовать позже» из онбординга — спрос на будущее
                aiProfileSummary text?,          // итог онбординга, входит в StudentContext
                onboardingCompletedAt?, linkCode (unique, 6 символов, ротация по запросу)
ParentProfile   id PK, userId FK unique
TeacherProfile  id PK, userId FK unique, schoolId FK, qualification?, bio?, photoUrl?,
                contactPhone?, contactEmail?, contactsVisible bool=false
RefreshToken    id PK, userId FK, tokenHash (unique), expiresAt, revokedAt?
```

### school (`school.prisma`)
```
School          id PK, name, timezone ("Europe/Moscow"), inviteCode (unique, для преподавателей),
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
Enrollment      id PK, studentId FK, groupId FK, status EnrollmentStatus, enrolledAt, leftAt?
                                                                        unique(studentId, groupId)
ScheduleRule    id PK, groupId FK, weekday 0..6, startTime "HH:mm", endTime "HH:mm", room?,
                validFrom date, validTo date?
Lesson          id PK, groupId FK, ruleId FK?, startsAt, endsAt, topic?, status LessonStatus=PLANNED,
                cancelReason?                                           index(groupId, startsAt)
```
Занятия материализуются worker'ом из правил на 8 недель вперёд (job `schedule.materialize`, ежедневно, идемпотентно по `(ruleId, startsAt)`). Ручные занятия — `ruleId = null`.

### attendance (`attendance.prisma`)
```
Attendance      id PK, lessonId FK, studentId FK, status AttendanceStatus, comment?,
                markedById FK(TeacherProfile), markedAt                 unique(lessonId, studentId)
```

### courses (`courses.prisma`)
```
Course          id PK, groupId FK, teacherId FK, title, description?, status CourseStatus=DRAFT,
                version int=1, publishedAt?, generationJobId FK?, deletedAt?
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
                meta json?, occurredAt                                  index(studentId, occurredAt)
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
                tokensIn int?, tokensOut int?                           index(conversationId, createdAt)
AiInsight       id PK, kind InsightKind, studentId FK, periodFrom date, periodTo date,
                content text, promptId, sourceHash, generatedAt, expiresAt
                                                                        unique(kind, studentId, periodFrom, periodTo)
Trajectory      id PK, studentId FK, content json { summary, strengths[], growthAreas[],
                recommendations[{ title, why, clubId?, courseId? }], nextSteps[] },
                promptId, sourceHash, generatedAt                       index(studentId, generatedAt)
```
StudentClubInterest id PK, studentId FK, clubId FK, status ClubInterestStatus (CHOSEN | LATER | SKIPPED),
                score? 0..1 (оценка ИИ), reason? (из рекомендации), source "ONBOARDING", createdAt, updatedAt
                unique(studentId, clubId); index(clubId, status)   // спрос на кружки из онбординга

### files + course-builder (`files.prisma`, `course-builder.prisma`)
```
File            id PK, ownerUserId FK, purpose FilePurpose, fileName, mime, sizeBytes, s3Key (unique),
                confirmedAt?, status MaterialStatus=UPLOADED, extractedTextKey?,
                extractMeta json? { pages, headings[] }, error?
CourseGenerationJob id PK, teacherId FK, groupId FK, courseId FK?, materialIds string[] (File.id),
                instructions text?, targetTitle?, sourceKind string='MATERIALS' (MATERIALS|TOPIC), topic text?,
                knowledge json? (KnowledgeBase: atoms, nodes, plan, stats), stage GenerationStage=QUEUED,
                progress int=0, draft json? (CourseDraft), error?, startedAt?, finishedAt?
```

### family (`family.prisma`)
```
ParentStudentLink parentId FK, studentId FK, status LinkStatus, requestedAt, confirmedAt?
                                                                        PK(parentId, studentId)
```
Привязка: ребёнок показывает `linkCode` → родитель вводит → link сразу `ACTIVE` (MVP; подтверждение школой — позже).

### payments (`payments.prisma`)
```
Payment         id PK, parentId FK, studentId FK, enrollmentId FK, amountKopecks int, currency "RUB",
                status PaymentStatus=PENDING, provider string, providerPaymentId? (unique),
                confirmationUrl?, periodsCount int, idempotencyKey (unique), paidAt?, failReason?, raw json?
PaidPeriod      id PK, enrollmentId FK, periodStart date, periodEnd date, paymentId FK
                                                                        index(enrollmentId, periodEnd)
```
«Следующая дата оплаты» = `max(PaidPeriod.periodEnd) + 1 день` для активного enrollment; если периодов нет — сегодня.

### notifications + support + audit (`notifications.prisma`, `support.prisma`, `base.prisma`)
```
Notification    id PK, userId FK, type NotificationType, title, body?, payload json?, readAt?
                                                                        index(userId, createdAt)
NotificationSettings userId PK, lessons bool, assignments bool, grades bool, attendance bool,
                insights bool, payments bool                              (все по умолчанию true)
SupportTicket   id PK, userId FK, subject, message, status TicketStatus=OPEN
AuditLog        id PK, actorUserId FK, action, entityType, entityId, diff json?
```

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
- **Активность** `activityScore` (0–100) за неделю: `min(100, 10*blocksCompleted + 15*submissions + 5*lessonsAttended + 2*tutorMessages + 1*appOpens)`. Отображается как «низкая (<30) / средняя / высокая (≥70)» + число.
- **Прогресс по кружку** `clubProgress = avg(CourseProgress.percent по PUBLISHED курсам группы)`; если курсов нет — `completionRate` по заданиям группы.
- **Динамика** — те же метрики по неделям из `StudentStatsDaily`; `trend` = разница с предыдущим периодом такой же длины.
- **Требуют внимания** (для преподавателя, с причинами): `attendanceRate < 0.7` за 30 дней; ≥2 просроченных сдачи подряд; 14 дней без `ActivityEvent`; средний балл < 50% по последним 3 проверенным.
