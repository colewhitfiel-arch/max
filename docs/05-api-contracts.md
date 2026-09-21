# 5. API и контракты

Единственный источник правды по формам запросов/ответов — `packages/contracts` (zod + ts-rest). Этот документ описывает, **что** должно быть в контракте. Файлы контракта разбиты по доменам так, чтобы у каждого был один backend-владелец (см. `10-ownership.md`).

## 5.1. Конвенции

- База: `/api/v1`. JSON, UTF-8. Даты-время — ISO 8601 UTC (`2026-09-21T10:00:00Z`), даты — `YYYY-MM-DD`. Деньги — целые копейки + `currency`.
- Auth: `Authorization: Bearer <accessJwt>`. Роль берётся из JWT (`activeRole`), не из URL.
- Префиксы путей по роли: `/student/*`, `/parent/*`, `/teacher/*`; общие — `/auth`, `/me`, `/ai`, `/catalog`, `/teachers/:id`, `/files`, `/notifications`, `/support`. Guard роли на каждом префиксе.
- Родитель всегда указывает ребёнка в пути: `/parent/children/:studentId/...`.
- Ошибки: `{ error: { code: ErrorCode, message: string, details?: unknown } }`. HTTP: 400 `VALIDATION`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 422 `BUSINESS_RULE`, 429 `RATE_LIMITED`, 500 `INTERNAL`.
- Списки: `{ items: T[], nextCursor?: string }`; параметры `cursor`, `limit` (≤100, по умолчанию 20).
- Периоды: `?from=YYYY-MM-DD&to=YYYY-MM-DD`, по умолчанию последние 30 дней.
- Идемпотентность: заголовок `Idempotency-Key` на `POST /student/assignments/:id/submit`, `POST /parent/children/:id/payments`.
- Стриминг: `text/event-stream`; события `token { text }`, `done { messageId, ... }`, `error { code, message }`. ts-rest SSE не типизирует — стриминговые ручки описываются zod-схемами событий в `ai.ts` и реализуются обычным Nest-контроллером.
- Эволюция контракта: добавление полей — свободно (опциональные); удаление/переименование — через депрекейт в этом документе и одну итерацию.

## 5.2. Общие DTO (`common.ts`, `enums.ts`)

```ts
Id = string (uuid)
Paginated<T> = { items: T[]; nextCursor?: string }
Period = { from: string; to: string }
Money = { amountKopecks: number; currency: 'RUB' }
UserBrief = { id, firstName, lastName?, nickname?, avatarUrl? }
StudentBrief = { id /* studentProfileId */, user: UserBrief, classLabel? }
TeacherBrief = { id, user: UserBrief, photoUrl? }
ClubBrief = { id, title, category: ClubCategory, coverUrl? }
GroupBrief = { id, title, club: ClubBrief, teacher: TeacherBrief }
LessonDto = { id, group: GroupBrief, startsAt, endsAt, topic?, status: LessonStatus, room?, attendance?: AttendanceStatus }
ScheduleRuleDto = { id, weekday, startTime, endTime, room? }
SubmissionBrief = { status: SubmissionStatus, score?, isLate, submittedAt? }
AssignmentBrief = { id, title, type: AssignmentType, group: GroupBrief, dueAt?, maxScore, submission?: SubmissionBrief }
StatsBrief = { attendanceRate: number|null, completionRate: number|null, activityScore: number, absences: number, lateCount: number, period: Period }
ClubProgress = { club: ClubBrief, group: GroupBrief, percent: number, attendanceRate: number|null, completionRate: number|null }
WeeklyPoint = { weekStart: string, attendanceRate: number|null, completionRate: number|null, activityScore: number }
AiText = { text: string, generatedAt: string } | null
FileDto = { id, fileName, mime, sizeBytes, url /* presigned GET, TTL 1 ч */ }
ApiError = { error: { code: ErrorCode; message: string; details?: unknown } }
```

## 5.3. Контракты по файлам

Формат: `METHOD path` — вход → выход. Роль подразумевается префиксом.

### `auth.ts` — владелец B1
```
POST /auth/max            public   { launchParams: string } → AuthResult
POST /auth/dev            dev-only { maxUserId: string, roles: Role[] } → AuthResult
POST /auth/refresh        public   { refreshToken } → { accessToken, refreshToken }
POST /auth/roles          auth     { role: Role, inviteCode?: string } → AuthResult   // STUDENT/PARENT свободно; TEACHER — по School.inviteCode
POST /auth/switch-role    auth     { role: Role } → AuthResult
POST /auth/logout         auth     { refreshToken } → 204
GET  /me                  auth     → MeDto
PATCH /me/settings        auth     { theme?: Theme, locale?: Locale } → MeDto
POST /student/link-code/rotate  student → { linkCode }

AuthResult = { accessToken, refreshToken, me: MeDto }
MeDto = { user: UserBrief, roles: Role[], activeRole: Role|null, needsRoleSetup: boolean,
          settings: { theme, locale },
          student?: { id, onboardingCompleted: boolean, schoolId?, linkCode, classLabel? },
          parent?: { id, childrenCount: number },
          teacher?: { id, schoolId } }
```

### `dashboards.ts` — владелец B6 (модуль analytics)
```
GET /student/home        → { today: LessonDto[], upcoming: LessonDto[] /* 7 дней, ≤10 */,
                             tasks: AssignmentBrief[] /* открытые, по дедлайну, ≤10 */,
                             stats: StatsBrief, clubs: ClubProgress[], aiComment: AiText,
                             week?: { date: DateOnly, status: ATTENDED|MISSED|TODAY|UPCOMING|NO_LESSONS }[] /* пн–вс, дуга «Посещения» */,
                             streakDays?: number /* серия дней с активностью */, points?: number /* баллы */ }
GET /student/profile     → { user: UserBrief, classLabel?, school?: { id, name }, clubs: ClubProgress[],
                             stats: StatsBrief, interests: string[], goals: string[] }

GET /parent/children/:studentId/home
                         → { student: StudentBrief, today: LessonDto[], upcoming: LessonDto[],
                             missed: LessonDto[] /* ABSENT за 14 дней */, newAssignments: AssignmentBrief[] /* 7 дней */,
                             overdue: AssignmentBrief[], stats: StatsBrief,
                             trend: { attendanceDelta: number|null, completionDelta: number|null }, aiSummary: AiText }
GET /parent/children/:studentId/analytics?from&to
                         → { stats: StatsBrief, clubs: ClubProgress[], weekly: WeeklyPoint[],
                             recentResults: [{ assignment: AssignmentBrief, score, maxScore, submittedAt, isLate }],
                             attendanceHistory: [{ lesson: LessonDto, status: AttendanceStatus }], aiSummary: AiText }

GET /teacher/home        → { today: LessonDto[], upcoming: LessonDto[], groups: GroupCard[],
                             toGrade: [{ assignment: AssignmentBrief, pendingCount }],
                             events: NotificationDto[] /* последние 5 */,
                             stats: { groupsCount, studentsCount, avgAttendanceRate, avgCompletionRate, needsAttentionCount } }
GET /teacher/groups      → { items: GroupCard[] }
GET /teacher/groups/:groupId
                         → GroupDetail = GroupCard & { schedule: ScheduleRuleDto[],
                             students: [{ student: StudentBrief, attendanceRate, completionRate, progress, activityScore,
                                          needsAttention: string[] /* причины, пусто = ок */ }] }
GET /teacher/students/:studentId
                         → { student: StudentBrief, groups: GroupBrief[], stats: StatsBrief, clubs: ClubProgress[],
                             weekly: WeeklyPoint[],
                             history: [{ assignment: AssignmentBrief, score?, isLate, submittedAt }],
                             attendanceHistory: [{ lesson: LessonDto, status }],
                             aiSummary: AiText, needsAttention: string[] }

GroupCard = GroupBrief & { studentsCount, attendanceRate, completionRate, needsAttentionCount, nextLesson?: LessonDto }
```

### `catalog.ts` — владелец B2
```
GET /catalog/clubs?category&cursor   → Paginated<ClubCard>
GET /catalog/clubs/:clubId           → ClubCard & { groups: [{ id, title, teacher: TeacherBrief, schedule: ScheduleRuleDto[] }] }
GET /teachers/:teacherId             → { ...TeacherBrief, qualification?, bio?, clubs: ClubBrief[],
                                          contacts?: { phone?, email? } /* только по политике школы */ }

ClubCard = ClubBrief & { description, price: Money, billingPeriod, tags: string[], teachers: TeacherBrief[], schedulePreview: string[] }
```

### `groups.ts` — владелец B2
```
GET  /student/calendar?from&to                  → { lessons: LessonDto[] }   // с attendance ученика
GET  /parent/children/:studentId/calendar?from&to → { lessons: LessonDto[] }
GET  /teacher/groups/:groupId/lessons?from&to   → { lessons: LessonDto[] }
POST /teacher/groups/:groupId/lessons           { startsAt, endsAt, topic?, room? } → LessonDto
PATCH /teacher/lessons/:lessonId                { topic?, room?, status?: 'CANCELLED', cancelReason? } → LessonDto
```

### `attendance.ts` — владелец B3
```
GET /teacher/lessons/:lessonId/attendance → AttendanceSheet
PUT /teacher/lessons/:lessonId/attendance { rows: [{ studentId, status: AttendanceStatus, comment? }] } → AttendanceSheet
                                          // upsert всех строк; переводит Lesson в DONE

AttendanceSheet = { lesson: LessonDto, rows: [{ student: StudentBrief, status: AttendanceStatus|null, comment? }] }
```

### `courses.ts` + `blocks/` — владелец B4
```
GET  /student/courses                    → { items: [{ id, title, group: GroupBrief,
                                              progress: { percent, completedBlocks, totalBlocks }, nextBlock?: { id, title, type } }] }
GET  /student/courses/:courseId          → { id, title, description?, group: GroupBrief,
                                              modules: [{ id, title, order, blocks: [{ id, title, type, order, estimatedMinutes?, isRequired,
                                                                                       progress: BlockProgressStatus|null }] }] }
GET  /student/blocks/:blockId            → { id, title, type, content /* без ответов для QUIZ */, moduleId, courseId,
                                              assignment?: AssignmentBrief, progress: { status, attempts, score? }|null }
POST /student/blocks/:blockId/open       → { progress }
POST /student/blocks/:blockId/complete   { answers?: unknown } → { progress, score?, courseProgress: { percent, completedBlocks, totalBlocks } }
                                          // QUIZ: проверяет; блоки-задания: делегирует в assignments.submitFromBlock

GET  /teacher/courses?groupId            → { items: [{ id, title, group: GroupBrief, status, modulesCount, blocksCount, publishedAt?, avgProgress }] }
POST /teacher/courses                    { groupId, title, description? } → TeacherCourseDetail
GET  /teacher/courses/:courseId          → TeacherCourseDetail
PUT  /teacher/courses/:courseId/structure CourseDraft → TeacherCourseDetail     // полная замена, только DRAFT
PATCH /teacher/blocks/:blockId           { title?, content? } → CourseBlockDto  // разрешено и после публикации (текстовые правки)
POST /teacher/courses/:courseId/publish  { assignments: [{ blockId, dueAt?, maxScore?, allowedAttempts? }] } → TeacherCourseDetail
POST /teacher/courses/:courseId/archive  → TeacherCourseDetail
GET  /teacher/courses/:courseId/progress → { students: [{ student: StudentBrief, percent, completedBlocks, lastActivityAt? }] }

CourseBlockDto = { id, type, title, order, content, estimatedMinutes?, isRequired }
TeacherCourseDetail = { id, title, description?, group: GroupBrief, status, version, publishedAt?,
                        modules: [{ id, title, summary?, order, blocks: CourseBlockDto[] }] }
CourseDraft = { title, description?, modules: [{ id?, title, summary?, sourceRefs?: string[],
                                                 blocks: [{ id?, type, title, content, estimatedMinutes?, isRequired? }] }] }
```

### `assignments.ts` — владелец B5
```
GET  /student/assignments?status=open|done|all&cursor → Paginated<AssignmentBrief>
GET  /student/assignments/:id            → AssignmentBrief & { description?, block?: { id, courseId }, submission?: SubmissionDto, attemptsLeft?: number }
POST /student/assignments/:id/submit     { answers?: unknown, text?: string, fileIds?: Id[] } → SubmissionDto   // Idempotency-Key

GET  /teacher/assignments?groupId&status=open|closed&cursor → Paginated<TeacherAssignmentCard>
POST /teacher/assignments                { groupId, title, description?, type?: AssignmentType='HOMEWORK', dueAt?, maxScore?, allowedAttempts?, publish: boolean } → TeacherAssignmentCard
PATCH /teacher/assignments/:id           { title?, description?, dueAt?, publish?: boolean } → TeacherAssignmentCard
DELETE /teacher/assignments/:id          → 204 (soft)
GET  /teacher/assignments/:id/submissions → { assignment: TeacherAssignmentCard, rows: [{ student: StudentBrief, submission: SubmissionDto|null }] }
GET  /teacher/submissions/:id            → SubmissionDto & { answers?, files: FileDto[], attempts: [{ n, score?, submittedAt }] }
POST /teacher/submissions/:id/grade      { score: number, feedback?: string, status: 'GRADED'|'RETURNED' } → SubmissionDto

SubmissionDto = { id, assignmentId, status, score?, isLate, attemptsCount, submittedAt?, gradedAt?, feedback?, text?, fileIds: Id[] }
TeacherAssignmentCard = AssignmentBrief & { description?, publishedAt?, studentsCount, submittedCount, gradedCount }
```

### `ai.ts` — владелец B10 (секции — A1/A2/A4)
```
POST /student/onboarding/start           → { conversationId, message: AiMessageDto }
POST /student/onboarding/messages        { conversationId, text } → SSE; done { messageId, isComplete: boolean, profileDraft?: OnboardingProfileDraft }
GET  /student/onboarding/recommendations → { items: [{ club: ClubCard, reason: string, score: number }] }   // после isComplete
POST /student/onboarding/complete        { selectedClubIds: Id[], profileDraft: OnboardingProfileDraft } → MeDto
                                          // Enrollment в первую активную группу каждого кружка (MVP)

GET  /ai/conversations?kind=TUTOR&cursor → Paginated<ConversationDto>
POST /ai/conversations                   { kind: 'TUTOR' } → ConversationDto
GET  /ai/conversations/:id/messages?cursor → Paginated<AiMessageDto>
POST /ai/conversations/:id/messages      { text } → SSE token/done/error      // rate limit: AI_TUTOR_DAILY_LIMIT
DELETE /ai/conversations/:id             → 204

GET  /student/trajectory                 → TrajectoryDto | null
POST /student/trajectory/refresh         → 202 { queued: true }               // rate limit 1/сутки

OnboardingProfileDraft = { interests: string[], goals: string[], weeklyHours: number, preferredFormats: string[], summary: string }
ConversationDto = { id, kind, title?, lastMessageAt? }
AiMessageDto = { id, role: MessageRole, content, createdAt }
TrajectoryDto = { content: { summary, strengths[], growthAreas[], recommendations: [{ title, why, clubId?, courseId? }], nextSteps[] }, generatedAt }
```

### `family.ts` — владелец B8
```
GET    /parent/children                  → { items: [{ student: StudentBrief, linkStatus: LinkStatus, school?: { id, name } }] }
POST   /parent/children/link             { code } → { student: StudentBrief, linkStatus }
DELETE /parent/children/:studentId       → 204 (REVOKED)
GET    /parent/children/:studentId/clubs → { items: [{ club: ClubCard, group: GroupBrief, enrollmentId, schedule: ScheduleRuleDto[],
                                              progress: ClubProgress, paidUntil?: string, nextPaymentAt: string, price: Money }] }
```

### `payments.ts` — владелец B8
```
GET  /parent/children/:studentId/payments → { periods: [{ enrollmentId, club: ClubBrief, paidUntil?, nextPaymentAt, price: Money }],
                                               history: Paginated<PaymentDto> }
POST /parent/children/:studentId/payments { enrollmentId, periodsCount: 1..12 } → { paymentId, confirmationUrl, amount: Money }   // Idempotency-Key
GET  /parent/payments/:paymentId          → PaymentDto
POST /webhooks/payments/:provider         public (подпись) → 200

PaymentDto = { id, club: ClubBrief, student: StudentBrief, amount: Money, status: PaymentStatus, periodsCount, createdAt, paidAt?, confirmationUrl? }
```

### `files.ts` — владелец B7
```
POST /files/upload-url     { fileName, mime, sizeBytes, purpose: FilePurpose } → { fileId, uploadUrl, headers: Record<string,string> }
POST /files/:fileId/confirm → FileDto
GET  /files/:fileId         → FileDto        // доступ по policies владельца/группы
```
Лимиты: MATERIAL ≤ 50 МБ (pdf, docx, pptx, txt, md, png, jpg), SUBMISSION ≤ 20 МБ, BLOCK_MEDIA ≤ 200 МБ, AVATAR ≤ 2 МБ.

### `course-builder.ts` — владелец A5 (скелет в F4)
```
POST /teacher/course-builder/jobs        { groupId, materialIds: Id[], instructions?, targetTitle? } → GenerationJobDto
GET  /teacher/course-builder/jobs?cursor → Paginated<Omit<GenerationJobDto,'draft'>>
GET  /teacher/course-builder/jobs/:id    → GenerationJobDto
PUT  /teacher/course-builder/jobs/:id/draft { draft: CourseDraft } → GenerationJobDto     // правки до accept
POST /teacher/course-builder/jobs/:id/accept → { courseId }                                // Course(DRAFT); stage=ACCEPTED
POST /teacher/course-builder/jobs/:id/cancel → GenerationJobDto

GenerationJobDto = { id, groupId, stage: GenerationStage, progress: number, materials: FileDto[], instructions?,
                     draft?: CourseDraft, courseId?, error?, createdAt, finishedAt? }
```

### `notifications.ts`, `support.ts` — владелец B9
```
GET  /notifications?cursor&unreadOnly    → Paginated<NotificationDto> & { unreadCount }
POST /notifications/read                 { ids?: Id[] } → { unreadCount }     // без ids — все
GET  /me/notification-settings           → NotificationSettingsDto
PUT  /me/notification-settings           NotificationSettingsDto → NotificationSettingsDto
POST /support/tickets                    { subject, message } → { id }
GET  /support/tickets                    → { items: [{ id, subject, status, createdAt }] }

NotificationDto = { id, type: NotificationType, title, body?, payload?: { entityType?, entityId?, route? }, readAt?, createdAt }
NotificationSettingsDto = { lessons, assignments, grades, attendance, insights, payments } (bool)
```

## 5.4. Доменные события (`events.ts`) — владелец contracts

Имена и payload'ы фиксируются здесь, потому что их потребляют минимум три модуля (`analytics`, `notifications`, `ai`).

```ts
'attendance.marked'       { lessonId, groupId, rows: [{ studentId, status }], markedById, at }
'submission.submitted'    { submissionId, assignmentId, studentId, groupId, isLate, attempt, at }
'submission.graded'       { submissionId, assignmentId, studentId, groupId, score, maxScore, status, at }
'block.opened'            { studentId, blockId, courseId, at }
'block.completed'         { studentId, blockId, courseId, score?, at }
'course.published'        { courseId, groupId, teacherId, blockAssignments: [{ blockId, type, title, dueAt?, maxScore?, allowedAttempts? }], at }
'lesson.cancelled'        { lessonId, groupId, at }
'enrollment.created'      { enrollmentId, studentId, groupId, at }
'payment.succeeded'       { paymentId, enrollmentId, studentId, parentId, periodsCount, at }
'payment.failed'          { paymentId, parentId, at }
'generation.finished'     { jobId, teacherId, stage: 'READY'|'FAILED', at }
'student.profile.updated' { studentId, at }
'tutor.message.sent'      { studentId, conversationId, at }
'app.opened'              { userId, studentId?, at }
```

Правила: событие описывает **факт**, не команду; обработчики идемпотентны; payload самодостаточен (обработчику не нужно ходить за данными, чтобы решить, реагировать ли).

## 5.5. Моки и фикстуры

`packages/contracts/src/fixtures/` — «демо-мир» в виде DTO: 1 школа, 3 кружка (робототехника, программирование, английский), 2 преподавателя, 6 учеников, 2 родителя (у одного — 2 ребёнка), занятия на ±2 недели с посещаемостью, курс с блоками всех 9 типов, задания в разных статусах, платежи. MSW-хендлеры (`apps/web/src/shared/api/mocks/handlers/<domain>.ts`) и seed (`packages/db/src/seed`) строятся из одних фикстур, чтобы FE на моках и на реальном API видел одно и то же.
