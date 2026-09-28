# 5. API и контракты

Единственный источник правды по формам запросов/ответов — `packages/contracts` (zod + ts-rest). Этот документ описывает, **что** должно быть в контракте. Файлы контракта разбиты по доменам так, чтобы у каждого был один backend-владелец (см. `10-ownership.md`).

## 5.1. Конвенции

- База: `/api/v1`. JSON, UTF-8. Даты-время — ISO 8601 UTC (`2026-09-21T10:00:00Z`), даты — `YYYY-MM-DD`. Деньги — целые копейки + `currency`.
- Auth: `Authorization: Bearer <accessJwt>`. Роль берётся из JWT (`activeRole`), не из URL.
- Префиксы путей по роли: `/student/*`, `/parent/*`, `/teacher/*`; общие — `/auth`, `/me`, `/ai`, `/catalog`, `/teachers/:id`, `/files`, `/notifications`, `/support`. Guard роли на каждом префиксе.
- Родитель всегда указывает ребёнка в пути: `/parent/children/:studentId/...`.
- Ошибки: `{ error: { code: ErrorCode, message: string, details?: unknown } }`. HTTP: 400 `VALIDATION`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 422 `BUSINESS_RULE`, 429 `RATE_LIMITED`, 500 `INTERNAL`, 501 `NOT_IMPLEMENTED`, 502 `EXTERNAL_INTEGRATION`. Ручка, которая есть в контракте, но ещё не реализована в API, отвечает 501 `NOT_IMPLEMENTED` (фильтр ошибок сверяет метод и путь с `apiContract`, `common/errors/contract-routes.ts`); неизвестный путь — 404 `NOT_FOUND`. Клиент 4xx и `NOT_IMPLEMENTED` не ретраит.
- Списки: `{ items: T[], nextCursor?: string }`; параметры `cursor`, `limit` (≤100, по умолчанию 20).
- Периоды: `?from=YYYY-MM-DD&to=YYYY-MM-DD`, по умолчанию последние 30 дней.
- Идемпотентность: заголовок `Idempotency-Key` (1–128 символов, `IdempotencyKeyHeadersSchema`) **обязателен** на `POST /student/assignments/:id/submit`, `POST /parent/children/:id/payments`, `POST /parent/wallet/top-up`, `POST /teacher/wallet/withdraw`; без него — 400 `VALIDATION`. Повтор с тем же ключом отдаёт первый результат. Клиент держит один ключ на попытку (ретрай и двойной клик — тот же ключ), новый — на новую попытку.
- Стриминг: `text/event-stream`; события `token { text }`, `done { messageId, ... }`, `error { code, message }`. ts-rest SSE не типизирует — стриминговые ручки описываются zod-схемами событий в `routes/streaming.ts` и реализуются обычным Nest-контроллером.
- Эволюция контракта: добавление полей — свободно (опциональные); удаление/переименование — через депрекейт в этом документе и одну итерацию.

## 5.2. Общие DTO (`common/`, `enums.ts`)

```ts
Id = string (uuid)
Paginated<T> = { items: T[]; nextCursor?: string }
Period = { from: string; to: string }
Money = { amountKopecks: number; currency: 'RUB' }
UserBrief = { id, firstName, lastName?, nickname?, avatarUrl? }
StudentBrief = { id /* studentProfileId */, user: UserBrief, classLabel? }
TeacherBrief = { id, user: UserBrief, photoUrl? }
ClubBrief = { id, title, category: ClubCategory, coverUrl? }
GroupBrief = { id, title, code?: string|null /* «001», 1–16 символов; нет — UI показывает title (docs/04, планируется) */,
               club: ClubBrief, teacher: TeacherBrief }
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

`School.timezone` — валидный IANA-пояс (`Europe/Moscow`; проверка через `Intl.DateTimeFormat`), в нём считаются «сегодня», недели и дни серии. `ClubInterestStatus` (`CHOSEN | LATER | SKIPPED`) — в `enums.ts` (`CLUB_INTEREST_STATUSES`), `routes/ai.ts` его реэкспортирует. События стрима тьютора (ученика и родителя) — общий `AiStreamEvent`; отдельного `TutorStreamEvent` нет.

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
PUT  /me/avatar           auth     { fileId: Id | null } → MeDto   // файл purpose AVATAR (files flow); null — убрать фото
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
                             stats: StatsBrief, interests: string[], goals: string[],
                             streakDays?: number, points?: number /* как на главной */,
                             week?: WeekDay[] /* дуга «Посещения», как на главной */,
                             homework?: HomeworkCounts /* «правильно» — как у кристаллов, docs/04 §4.6 */,
                             clubHomework?: [{ club: ClubBrief, group: GroupBrief, counts: HomeworkCounts, tasks: HomeworkTask[] }] }

GET /parent/children/:studentId/home
                         → { student: StudentBrief, today: LessonDto[], upcoming: LessonDto[],
                             missed: LessonDto[] /* ABSENT за 14 дней */, newAssignments: AssignmentBrief[] /* 7 дней */,
                             overdue: AssignmentBrief[], stats: StatsBrief,
                             trend: { attendanceDelta: number|null, completionDelta: number|null }, aiSummary: AiText }
GET /parent/children/:studentId/analytics?from&to
                         → { stats: StatsBrief, clubs: ClubProgress[], weekly: WeeklyPoint[],
                             recentResults: [{ assignment: AssignmentBrief, score, maxScore, submittedAt, isLate }],
                             attendanceHistory: [{ lesson: LessonDto, status: AttendanceStatus }], aiSummary: AiText,
                             week?: WeekDay[] /* пн–вс, дуга «Посещения», как у ученика */,
                             homework?: HomeworkCounts /* круговая диаграмма «Домашние задачи» */,
                             clubHomework?: [{ club: ClubBrief, group: GroupBrief, counts: HomeworkCounts, tasks: HomeworkTask[] }] }
GET /parent/children/:studentId/homework-progress?days=1|7|30   /* по умолчанию 7 */
                         → { days, items: [{ club: ClubBrief, group: GroupBrief, done, recommended }] }
                             // «Выполненные задания» на главной родителя; формула — docs/04 §4.6
GET /parent/children/:studentId/groups/:groupId/tasks
                         → { group: GroupBrief, items: HomeworkTaskDetail[] }   // экран «Задания» (подробная аналитика)

GET /teacher/home        → { today: LessonDto[], upcoming: LessonDto[], groups: GroupCard[],
                             toGrade: [{ assignment: AssignmentBrief, pendingCount }],
                             events: NotificationDto[] /* последние 5 */,
                             stats: { groupsCount, studentsCount, avgAttendanceRate, avgCompletionRate, needsAttentionCount } }
GET /teacher/groups      → { items: GroupCard[] }
GET /teacher/groups/:groupId
                         → GroupDetail = GroupCard & { schedule: ScheduleRuleDto[],
                             students: [{ student: StudentBrief, attendanceRate, completionRate, progress, activityScore,
                                          needsAttention: string[] /* причины, пусто = ок */ }] }
                             // чужая (или несуществующая) группа → 403 FORBIDDEN
GET /teacher/students/:studentId
                         → { student: StudentBrief, groups: GroupBrief[], stats: StatsBrief, clubs: ClubProgress[],
                             weekly: WeeklyPoint[],
                             history: [{ assignment: AssignmentBrief, score?, isLate, submittedAt }],
                             attendanceHistory: [{ lesson: LessonDto, status }],
                             aiSummary: AiText, needsAttention: string[],
                             week?: WeekDay[] /* пн–вс, дуга «Посещения» */,
                             homework?: HomeworkCounts /* порог — как у родителя, docs/04 §4.6 */,
                             clubHomework?: [{ club: ClubBrief, group: GroupBrief, counts: HomeworkCounts, tasks: HomeworkTask[] }] }
                             // teacher:students.view; всё — только по группам этого преподавателя;
                             // нет общих групп (в том числе нет такого ученика) → 403 FORBIDDEN «Ученик не в ваших группах»
GET /teacher/students/:studentId/groups/:groupId/tasks
                         → { group: GroupBrief, items: HomeworkTaskDetail[] }   // экран «Задания» ученика
                             // teacher:students.view; чужая (или несуществующая) группа или ученик не в ней → 403 FORBIDDEN;
                             // для преподавателя «нет» и «не ваш» неразличимы: фронт показывает на 403 пустое состояние
                             // «Ученик не в ваших группах»; NOT_FOUND с телом ApiError — «Не найдено» без повтора,
                             // «раздел в разработке» — только NOT_IMPLEMENTED (501 или голый 404 без тела ApiError)
GET /teacher/performance?period=day|week|month|course   /* по умолчанию day */
                         → TeacherPerformanceDto   // «Общая успеваемость»; teacher:groups.view
                             // другой period → 400 VALIDATION; нет групп → groups: []; формулы и окна — docs/04 §4.6

GroupCard = GroupBrief & { studentsCount, attendanceRate, completionRate, needsAttentionCount, nextLesson?: LessonDto }
TeacherPerformanceDto = { period: day|week|month|course, from, to /* DateTime */, groups: TeacherGroupPerformance[] }
TeacherGroupPerformance = { group: GroupBrief, studentsCount, attended /* PRESENT|LATE */, missed /* ABSENT|EXCUSED */,
                            homeworkDone /* сдано из заданий со сроком в периоде */, homeworkCorrect /* из них DONE */ }
WeekDay = { date: DateOnly, status: ATTENDED|MISSED|TODAY|UPCOMING|NO_LESSONS }
HomeworkCounts = { correct /* DONE */, wrong /* FAILED */, upcoming /* SOON + LATER */ }
HomeworkTask = { assignmentId, number /* 1.. внутри группы */, title, status: DONE|FAILED|SOON|LATER, dueAt?, scorePercent? }
HomeworkTaskDetail = HomeworkTask & { statement, code?: { language: python|cpp|javascript|text, source }, answer?, correctAnswer?,
                                      score?, maxScore }
```
Статусы заданий (DONE / FAILED / SOON / LATER), окно `days` и счётчики успеваемости групп — docs/04 §4.6.

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
GET  /teacher/calendar?from&to                  → { lessons: LessonDto[] }   // занятия всех групп преподавателя (главная: «‹ Сегодня ›»,
                                                                            // календарь); teacher:groups.view
POST /teacher/groups/:groupId/lessons           { startsAt, endsAt, topic?, room? } → LessonDto   // endsAt > startsAt, иначе 400 VALIDATION
PATCH /teacher/lessons/:lessonId                { topic?, room?, status?: 'CANCELLED', cancelReason? } → LessonDto

// Группы преподавателя (F19); teacher:groups.manage, чужая группа — 403
POST   /teacher/groups                          { title, clubId } → GroupBrief   // title 1..100 (trim); кружок не из школы преподавателя — 400 VALIDATION;
                                                                                // название уже есть среди его активных групп (без учёта регистра) — 409 CONFLICT
PATCH  /teacher/groups/:groupId                 { title } → GroupBrief
GET    /teacher/groups/:groupId/candidates?q    → { items: StudentBrief[] }   // ученики школы преподавателя и его активных групп, не в составе
                                                                            // этой группы; q — подстрока имени/фамилии/ника; по алфавиту, до 50
POST   /teacher/groups/:groupId/students        { studentId } → GroupRoster { groupId, students: StudentBrief[] }
                                                // идемпотентно; ученик не из кандидатов — 404; новое/возвращённое после ухода
                                                // зачисление → событие enrollment.created
DELETE /teacher/groups/:groupId/students/:studentId → GroupRoster   // зачисление → LEFT (leftAt), оплаты и история остаются; идемпотентно
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
GET  /student/blocks/:blockId            → { id, title, type, content /* без ответов, см. ниже */, moduleId, courseId,
                                              assignment?: AssignmentBrief, progress: { status, attempts, score? }|null }
POST /student/blocks/:blockId/open       → { progress }
POST /student/blocks/:blockId/complete   { answers?: unknown } → { progress, score?, courseProgress: { percent, completedBlocks, totalBlocks } }
                                          // QUIZ: проверяет; блоки-задания: делегирует в assignments.submitFromBlock

GET  /teacher/courses?groupId            → { items: [{ id, title, group: GroupBrief, status, modulesCount, blocksCount, publishedAt?, avgProgress }] }
POST /teacher/courses                    { groupId, title, description? } → TeacherCourseDetail
GET  /teacher/courses/:courseId          → TeacherCourseDetail
PUT  /teacher/courses/:courseId/structure CourseDraft → TeacherCourseDetail     // полная замена, только DRAFT
PATCH /teacher/blocks/:blockId           { type, title?, content? } → CourseBlockDto  // type — дискриминатор схемы content  // разрешено и после публикации (текстовые правки)
POST /teacher/courses/:courseId/publish  { assignments: [{ blockId, dueAt?, maxScore?, allowedAttempts?, studentIds?: Id[] }] } → TeacherCourseDetail
                                          // идемпотентна и инкрементальна: блок, у которого Assignment уже есть, пропускается,
                                          // поэтому повторный вызов после дополнения курса публикует только новые модули
POST /teacher/courses/:courseId/archive  → TeacherCourseDetail
GET  /teacher/courses/:courseId/progress → { students: [{ student: StudentBrief, percent, completedBlocks, lastActivityAt? }] }

CourseBlockDto = { id, type, title, order, content, estimatedMinutes?, isRequired }
TeacherCourseDetail = { id, title, description?, group: GroupBrief, status, version, publishedAt?,
                        modules: [{ id, title, summary?, order, blocks: CourseBlockDto[] }] }
CourseDraft = { title, description?, modules: [{ id?, title, summary?, sourceRefs?: string[],
                                                 blocks: [{ id?, type, title, content, estimatedMinutes?, isRequired? }] }] }
```

Содержимое блоков (`blocks/`):
- **Ученик ответов не получает** (`CourseBlockForStudentSchema`): QUIZ — без `correctOptionIds` и `explanation`, QUESTION — без `expectedAnswer` и `rubric`. Сервер отдаёт ученику результат `toStudentBlock(block)` — явная очистка, а не парсинг схемой (в production ts-rest ответы не валидирует). Ответы INTERACTIVE (FILL_GAPS, пары MATCHING, оборот FLASHCARDS) пока уходят ученику как есть — открытый вопрос (docs/12, техдолг).
- VIDEO: `url` — только абсолютная ссылка `http(s)` (`HttpUrlSchema`/`isHttpUrl`, без `javascript:`/`data:`); обязателен `url` или `fileId`.
- QUIZ: `correctOptionIds` ⊆ `options[].id`; при `multiple: false` — ровно один правильный вариант.

### `assignments.ts` — владелец B5
```
GET  /student/assignments?status=open|done|all&cursor → Paginated<AssignmentBrief>
GET  /student/assignments/:id            → AssignmentBrief & { description?, block?: { id, courseId }, submission?: SubmissionDto, attemptsLeft?: number }
POST /student/assignments/:id/submit     { answers?: unknown, text?: string, fileIds?: Id[] } → SubmissionDto   // Idempotency-Key (обязателен)
                                          // пустая сдача (нет непустого текста, файлов и ответов на блоки) → 400 VALIDATION
GET  /student/homework                   → { clubs: HomeworkClub[] /* по ближайшему дедлайну */,
                                             streakDays?: number, points?: number /* как на главной */ }   // экран «Задания» (карта кружков)

GET  /teacher/assignments?groupId&status=open|closed&cursor → Paginated<TeacherAssignmentCard>
POST /teacher/assignments                { groupId, title, description?, type?: AssignmentType='HOMEWORK', dueAt?, maxScore?, allowedAttempts?,
                                           studentIds?: Id[] /* пусто — всей группе; чужой ученик → 422 */, publish: boolean } → TeacherAssignmentCard
PATCH /teacher/assignments/:id           { title?, description?, dueAt?, publish?: boolean } → TeacherAssignmentCard
DELETE /teacher/assignments/:id          → 204 (soft)
GET  /teacher/assignments/:id/submissions → { assignment: TeacherAssignmentCard, rows: [{ student: StudentBrief, submission: SubmissionDto|null }] }
GET  /teacher/submissions/:id            → SubmissionDto & { answers?, files: FileDto[], attempts: [{ n, score?, submittedAt }] }
POST /teacher/submissions/:id/grade      { score: number, feedback?: string, status: 'GRADED'|'RETURNED' } → SubmissionDto

SubmissionDto = { id, assignmentId, status, score?, isLate, attemptsCount, submittedAt?, gradedAt?, feedback?, text?, fileIds: Id[] }
TeacherAssignmentCard = AssignmentBrief & { description?, publishedAt?, studentIds: Id[] /* пусто — всей группе */, courseId?,
                                            studentsCount /* адресаты или весь состав — только текущий (ACTIVE) */,
                                            submittedCount, gradedCount /* сдачи этих же учеников */ }
HomeworkClub = { club: ClubBrief, group: GroupBrief, openCount /* открытые задания */, points /* баллы по кружку, формула — analytics */,
                 nextAssignment?: AssignmentBrief /* ближайшее открытое по дедлайну */ }
```

### `ai.ts` — владелец B10 (секции — A1/A2/A4)
```
POST /student/onboarding/start           → { conversationId, message: AiMessageDto, history?: AiMessageDto[], profileDraft?, clubOptions?: ClubCard[] }
                                          // незавершённое знакомство (kind ONBOARDING) продолжается: history — вся лента,
                                          // profileDraft — если диалог уже собрал профиль, clubOptions — кнопки последней реплики
POST /student/onboarding/messages        { conversationId, text } → SSE; done { messageId, isComplete: boolean, profileDraft?: OnboardingProfileDraft, clubOptions?: ClubCard[] }
                                          // clubOptions — кружки школы, предложенные репликой (модель называет их в `clubOptions`,
                                          // плюс упомянутые в тексте); клиент показывает кнопками, нажатие отправляет название
GET  /student/onboarding/recommendations → { items: [{ club: ClubCard, reason: string, score: number }] }   // после isComplete
POST /student/onboarding/complete        { selectedClubIds: Id[], laterClubIds?: Id[], profileDraft: OnboardingProfileDraft } → MeDto
                                          // selected — запись сейчас; later — «попробовать позже» (спрос, без записи);
                                          // показанные, но не выбранные → SKIPPED. Диалог знакомства становится чатом тьютора
                                          // (kind TUTOR, title «Знакомство с тьютором» — так он виден в истории чатов)
GET  /teacher/clubs/demand               → { students, futureInterests: [{ label, count }], items: [{ club: ClubCard, chosen, later, skipped, avgScore?, reasons[] }] }
                                          // Enrollment в первую активную группу каждого кружка (MVP)

GET  /ai/conversations?kind=TUTOR&cursor → Paginated<ConversationDto>   // история чатов: свежие сверху; title — по первому вопросу
POST /ai/conversations                   { kind: 'TUTOR' } → ConversationDto   // клиент создаёт диалог первой отправкой нового чата
GET  /ai/conversations/:id/messages?cursor → Paginated<AiMessageDto>   // лента с конца: первая страница — последние
                                          // limit сообщений (внутри — по возрастанию времени), nextCursor ведёт к более старым
POST /ai/conversations/:id/messages      { text } → SSE token/done/error      // rate limit: AI_TUTOR_DAILY_LIMIT
DELETE /ai/conversations/:id             → 204

GET  /parent/children/:studentId/ai/conversations?cursor → Paginated<ConversationDto>   // тьютор родителя о ребёнке
POST /parent/children/:studentId/ai/conversations        → ConversationDto (kind TUTOR)
GET  /parent/ai/conversations/:id/messages?cursor        → Paginated<AiMessageDto>   // пагинация с конца, как у ученика
POST /parent/ai/conversations/:id/messages { text } → SSE token/done/error               // промпт tutor.parent; лимит как у ученика
                                          // доступ: родитель ↔ ребёнок ACTIVE (FamilyService), иначе 403

GET  /student/trajectory                 → TrajectoryDto | null
POST /student/trajectory/refresh         → 202 { queued: true }               // rate limit 1/сутки

OnboardingProfileDraft = { interests: string[], goals: string[], weeklyHours: number, preferredFormats: string[], summary: string, futureInterests: string[] }
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
POST   /parent/children/invites          → { token, url, expiresAt }   // ссылка-приглашение ребёнку, живёт 7 дней
GET    /student/parent-invites/:token    student → { token, parent: UserBrief, expiresAt, status: PENDING|ACCEPTED|EXPIRED, alreadyLinked? }
POST   /student/parent-invites/:token/accept student → { parent: UserBrief, linkStatus }   // связь → ACTIVE
```
`url` строит сервер: с `MAX_BOT_NAME` — диплинк мини-приложения MAX `https://max.ru/<MAX_BOT_NAME>?startapp=invite_<token>` (хелперы `childInviteStartParam` / `parseChildInviteStartParam` в `family.ts`), без него — `${WEB_URL}/invite/<token>` (экран `/invite/:token`). `alreadyLinked` — ученик уже привязан к этому родителю. `accept`: повтор тем же учеником — 200, пока связь ACTIVE (после отвязки — 422); чужой по принятой ссылке и уже привязанный ребёнок — 409 `CONFLICT` (во втором случае ссылка не гасится); истёкшая и своё же приглашение — 422 `BUSINESS_RULE`; нет такого — 404. Поток — docs/07 F14.

### `payments.ts` — владелец B8
```
GET  /parent/children/:studentId/payments → { periods: [{ enrollmentId, club: ClubBrief, paidUntil?, nextPaymentAt, price: Money }],
                                               history: Paginated<PaymentDto> }
POST /parent/children/:studentId/payments { enrollmentId, periodsCount: 1..12 } → { paymentId, confirmationUrl, amount: Money }   // Idempotency-Key
GET  /parent/payments/:paymentId          → PaymentDto
GET  /parent/wallet                       → { balance: Money }
POST /parent/wallet/top-up                { amountKopecks: 10000..10000000 } → { balance: Money }   // Idempotency-Key; ЗАГЛУШКА (docs/07 F13)
GET  /teacher/wallet?period=day|week|month   /* по умолчанию day */
                                          → TeacherWallet   // teacher:wallet.view; другой period → 400 VALIDATION; ЗАГЛУШКА (docs/07 F17)
POST /teacher/wallet/withdraw             { amountKopecks: ≥ 10000 } → { balance: Money, transaction: TeacherWalletTransaction }
                                          // teacher:wallet.withdraw; Idempotency-Key; ЗАГЛУШКА — списание сразу, перевода нет
                                          // < 100 ₽ → 400 VALIDATION; больше баланса → 422 BUSINESS_RULE «Недостаточно средств»;
                                          // тот же ключ и сумма → тот же ответ без второго списания; тот же ключ, другая сумма → 409 CONFLICT
POST /webhooks/payments/:provider         public (подпись) → 200

PaymentDto = { id, club: ClubBrief, student: StudentBrief, amount: Money, status: PaymentStatus, periodsCount, createdAt, paidAt?, confirmationUrl? }
TeacherWallet = { balance: Money, period: day|week|month, from, to /* DateTime */,
                  history: [{ at, balance: Money }] /* по возрастанию at, равный шаг: day — 7 точек через 4 ч, week — 8, month — 31
                                                       (через сутки); первая — баланс на from, последняя — текущий */,
                  transactions: TeacherWalletTransaction[] /* за период, по убыванию at */,
                  debts: [{ id /* enrollmentId */, group: GroupBrief, student: StudentBrief, amount: Money,
                            dueAt: DateOnly /* следующий платёж; прошёл — просрочено */ }] /* «Вам должны», по возрастанию dueAt */ }
TeacherWalletTransaction = { id, kind: INCOME|WITHDRAWAL, amount: Money /* > 0 */, at,
                             group: GroupBrief|null, student: StudentBrief|null /* у WITHDRAWAL — null */ }
```
Смысл полей кошелька преподавателя, окна периодов и правило «Вам должны» — docs/04 (payments). Новый преподаватель получает пустой кошелёк: баланс 0 и пустые списки.

### `files.ts` — владелец B7
```
POST /files/upload-url     { fileName, mime, sizeBytes, purpose: FilePurpose } → { fileId, uploadUrl, headers: Record<string,string> }
POST /files/:fileId/confirm → FileDto
GET  /files/:fileId         → FileDto        // доступ по policies владельца/группы
```
Лимиты: MATERIAL ≤ 50 МБ (pdf, docx, pptx, txt, md, png, jpg), SUBMISSION ≤ 20 МБ, BLOCK_MEDIA ≤ 200 МБ, AVATAR ≤ 2 МБ. Текст извлекается пока только из pdf, docx, txt, md: задачу course-builder с материалами png/jpg/pptx сервер отклоняет сразу (422 `BUSINESS_RULE`).

### `course-builder.ts` — владелец A5 (скелет в F4)
```
POST /teacher/course-builder/jobs        { groupId, materialIds?: Id[], topic?: string, instructions?, targetTitle?,
                                           target?: 'COURSE'|'HOMEWORK'='COURSE', targetCourseId?: Id /* курс той же группы, который дополняем */,
                                           studentIds?: Id[] /* адресаты заданий; пусто — всей группе */, dueAt? } → GenerationJobDto
                                          // materialIds или topic (тема/практика без конспекта)
GET  /teacher/course-builder/jobs?cursor → Paginated<Omit<GenerationJobDto,'draft'>>
GET  /teacher/course-builder/jobs/:id    → GenerationJobDto
PUT  /teacher/course-builder/jobs/:id/draft { draft: CourseDraft } → GenerationJobDto     // правки до accept
POST /teacher/course-builder/jobs/:id/accept → { courseId, assignmentsCreated }             // stage=ACCEPTED; идемпотентно
                                          // targetCourseId задан — курс дополняется модулями, иначе создаётся Course(DRAFT);
                                          // target=HOMEWORK (и дополнение уже опубликованного курса) публикуется сразу:
                                          // блоки-задания модуля становятся Assignment с dueAt и studentIds задачи
POST /teacher/course-builder/jobs/:id/cancel → GenerationJobDto

GenerationJobDto = { id, groupId, stage: GenerationStage, progress: number, materials: FileDto[], instructions?,
                     sourceKind: 'MATERIALS'|'TOPIC', target: 'COURSE'|'HOMEWORK', targetCourseId?, studentIds: Id[], dueAt?,
                     topic?, knowledge?: KnowledgeBase (атомы, узлы с цитатами, план),
                     draft?: CourseDraft, courseId?, error?, createdAt, finishedAt? }     // в списке — без draft и knowledge
Пайплайн стадий и формат KnowledgeBase — docs/13-course-pipeline.md.
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

`packages/contracts/src/fixtures/` — «демо-мир» в виде DTO, намеренно маленький (фактический состав — шапка `fixtures/index.ts` и `FOUNDATION.md` §5): 1 школа (`Europe/Moscow`), 4 пользователя, 2 кружка (робототехника, программирование), 2 группы, 1 преподаватель (он же родитель), 2 ученика, 1 родитель (у него 2 ребёнка), 3 зачисления, 3 правила расписания (робототехника пн/чт, программирование вт), 5 занятий со смещением −7…+4 дня от «сегодня» и 4 отметки посещаемости на двух прошедших, курс с 4 блоками (TEXT/VIDEO/QUIZ/HOMEWORK), 3 задания, 1 сдача, диалог с ИИ, платёж с оплаченным периодом, уведомление. MSW-хендлеры (`apps/web/src/shared/api/mocks/handlers/<domain>.ts`) и seed (`packages/db/src/seed`) строятся из одних фикстур, чтобы FE на моках и на реальном API видел одно и то же.

Даты, которые должны «жить» относительно сегодняшнего дня, задаются смещением и материализуются функциями (`now`, смещение пояса школы — по умолчанию 180 мин):
- `materializeLessons(specs, now, tz)` — общая функция (её используют и моки); `materializeDemoLessons(now, tz)` — обёртка над `demoLessonSpecs`. День считается по часам школы. Все 5 демо-занятий разовые (`ruleId: null`): их даты плавают и с днём недели правил не совпадают.
- `materializeDemoAttendance(now, tz)` — посещаемость с `markedAt` = начало занятия. У константы `demoAttendance` `markedAt` — заглушка, напрямую её не брать.
- `materializeDemoPayment(now, tz)` / `materializeDemoPaidPeriod(now, tz)` — оплата Ольги за робототехнику Алексея 22 дня назад (10:00 по часам школы), период 30 дней с дня оплаты. Констант `demoPayment`/`demoPaidPeriod` больше нет.
- `demoAssignmentDueOffsets` — дедлайны заданий в днях от «сейчас».

Остальные даты (`createdAt`, `publishedAt`, сдача, диалог) — фиксированная `T0 = 2026-09-01`.
