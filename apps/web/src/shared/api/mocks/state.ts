/**
 * Изменяемое состояние демо-мира для MSW: копии фикстур + дополнения моков (`world-extras.ts`)
 * + то, что меняют мутации (сессии, настройки, привязки, прогресс, сдачи, уведомления, диалоги,
 * кошельки родителей и преподавателей, приглашения). Живёт до перезагрузки; исключение —
 * ad-hoc пользователи dev-входа, которые при `enableMockPersistence()` переживают reload.
 */
import type {
  AiConversation,
  AiMessage,
  Assignment,
  Attendance,
  BlockProgress,
  Club,
  Course,
  CourseBlock,
  CourseGenerationJob,
  CourseModule,
  CreatePaymentResult,
  Enrollment,
  FileDto,
  Group,
  Lesson,
  Notification as NotificationEntity,
  NotificationSettings,
  PaidPeriod,
  ParentProfile,
  ParentStudentLink,
  Payment,
  Role,
  ScheduleRule,
  StudentProfile,
  Submission,
  SubmissionDto,
  TeacherProfile,
  TeacherWithdrawal,
  Trajectory,
  UserSettings,
} from '@edu/contracts';
import {
  DEMO_IDS,
  type DemoUser,
  demoAssignments,
  demoBlocks,
  demoClubs,
  demoConversation,
  demoCourse,
  demoEnrollments,
  demoGroups,
  demoMessages,
  demoModules,
  demoNotification,
  demoNotificationUserId,
  demoParentLinks,
  demoParents,
  demoScheduleRules,
  demoStudents,
  demoSubmissions,
  demoTeachers,
  demoUsers,
  materializeDemoAttendance,
  materializeDemoLessons,
  materializeDemoPaidPeriod,
  materializeDemoPayment,
} from '@edu/contracts/fixtures';
import {
  buildWorldExtras,
  DEMO_WALLET_START_KOPECKS,
  MOCK_GROUP_CODES,
  type MockInvite,
} from './world-extras';

export type MockUser = DemoUser;
export type MockNotification = NotificationEntity & { userId: string };
/** Группа мок-мира: + короткий номер (`GroupBrief.code`; в модели данных пока нет — docs/04). */
export type MockGroup = Group & { code: string | null };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildState() {
  const now = new Date();
  const dayMs = 86_400_000;
  // Пояс браузера вместо МСК: «сегодняшние» занятия остаются сегодняшними в любом TZ.
  const tzOffset = -now.getTimezoneOffset();
  const extras = buildWorldExtras(now);
  const users = new Map<string, MockUser>();
  for (const user of [...Object.values(demoUsers), ...extras.users])
    users.set(user.id, clone(user));

  const extraNotifications: MockNotification[] = [
    { ...clone(demoNotification), userId: demoNotificationUserId },
    {
      id: '00000000-0000-7000-8000-000000000151',
      userId: DEMO_IDS.users.student1,
      type: 'LESSON_SOON',
      title: 'Скоро занятие',
      body: 'Робототехника сегодня в 15:00, каб. 12',
      payload: {
        entityType: 'lesson',
        entityId: DEMO_IDS.lessons.roboticsToday,
        route: '/student',
      },
      readAt: null,
      createdAt: new Date(now.getTime() - 2 * 3_600_000).toISOString(),
    },
    {
      id: '00000000-0000-7000-8000-000000000152',
      userId: DEMO_IDS.users.student1,
      type: 'ASSIGNMENT_GRADED',
      title: 'Задание проверено',
      body: 'Задачи 1–10, стр. 52 — 85 из 100',
      payload: {
        entityType: 'assignment',
        entityId: DEMO_IDS.assignments.simpleHomework,
        route: `/student/assignments/${DEMO_IDS.assignments.simpleHomework}`,
      },
      readAt: new Date(now.getTime() - dayMs).toISOString(),
      createdAt: new Date(now.getTime() - dayMs - 3_600_000).toISOString(),
    },
    {
      id: '00000000-0000-7000-8000-000000000153',
      userId: DEMO_IDS.users.teacher,
      type: 'SUBMISSION_RECEIVED',
      title: 'Новая сдача',
      body: 'Алексей С. сдал «Задачи 1–10, стр. 52»',
      payload: {
        entityType: 'assignment',
        entityId: DEMO_IDS.assignments.simpleHomework,
        route: '/teacher/assignments',
      },
      readAt: null,
      createdAt: new Date(now.getTime() - 5 * 3_600_000).toISOString(),
    },
    {
      id: '00000000-0000-7000-8000-000000000154',
      userId: DEMO_IDS.users.parent,
      type: 'ATTENDANCE_ABSENT',
      title: 'Пропуск занятия',
      body: 'Даша пропустила занятие по робототехнике',
      payload: { entityType: 'lesson', entityId: DEMO_IDS.lessons.roboticsPast1, route: '/parent' },
      readAt: null,
      createdAt: new Date(now.getTime() - 7 * dayMs).toISOString(),
    },
    {
      id: '00000000-0000-7000-8000-000000000155',
      userId: DEMO_IDS.users.parent,
      type: 'PAYMENT_SUCCEEDED',
      title: 'Оплата прошла',
      body: 'Робототехника — 3 500 ₽ за сентябрь',
      payload: { entityType: 'payment', entityId: DEMO_IDS.payment, route: '/parent/payments' },
      readAt: null,
      createdAt: new Date(now.getTime() - 20 * dayMs).toISOString(),
    },
  ];

  const trajectory: Trajectory = {
    id: '00000000-0000-7000-8000-000000000160',
    studentId: DEMO_IDS.students.alexey,
    content: {
      summary:
        'Алексей уверенно осваивает основы робототехники и делает первые шаги в Python. Сильная сторона — практика, зона роста — регулярность домашних заданий.',
      strengths: ['практические задачи', 'работа с датчиками'],
      growthAreas: ['регулярность выполнения ДЗ', 'циклы в Python'],
      recommendations: [
        {
          title: 'Проект «Робот-следопыт»',
          why: 'Закрепит работу с датчиками расстояния',
          clubId: DEMO_IDS.clubs.robotics,
        },
        {
          title: 'Мини-игра на Python',
          why: 'Практика циклов в игровой форме',
          clubId: DEMO_IDS.clubs.programming,
        },
      ],
      nextSteps: ['Сдать задачи 1–10 до пятницы', 'Пройти блок «Датчики» в курсе'],
    },
    generatedAt: new Date(now.getTime() - 3 * dayMs).toISOString(),
  };

  return {
    users,
    students: clone(demoStudents) as StudentProfile[],
    parents: clone(demoParents) as ParentProfile[],
    teachers: clone([...demoTeachers, ...extras.teachers]) as TeacherProfile[],
    links: clone(demoParentLinks) as ParentStudentLink[],
    settings: new Map<string, UserSettings>(),
    /** Настройки уведомлений: userId → настройки (нет записи — все включены). */
    notificationSettings: new Map<string, NotificationSettings>(),
    clubs: clone([...demoClubs, ...extras.clubs]) as Club[],
    groups: clone([...demoGroups, ...extras.groups]).map((group): MockGroup => ({
      ...group,
      code: MOCK_GROUP_CODES[group.id] ?? null,
    })),
    enrollments: clone([...demoEnrollments, ...extras.enrollments]) as Enrollment[],
    scheduleRules: clone([...demoScheduleRules, ...extras.scheduleRules]) as ScheduleRule[],
    lessons: [...materializeDemoLessons(now, tzOffset), ...extras.lessons] as Lesson[],
    attendance: clone([
      ...materializeDemoAttendance(now, tzOffset),
      ...extras.attendance,
    ]) as Attendance[],
    courses: [clone(demoCourse)] as Course[],
    modules: clone(demoModules) as CourseModule[],
    blocks: clone(demoBlocks) as CourseBlock[],
    blockProgress: [
      {
        studentId: DEMO_IDS.students.alexey,
        blockId: DEMO_IDS.blocks.introText,
        status: 'COMPLETED',
        openedAt: new Date(now.getTime() - 5 * dayMs).toISOString(),
        completedAt: new Date(now.getTime() - 5 * dayMs).toISOString(),
        attempts: 1,
        score: null,
      },
      {
        studentId: DEMO_IDS.students.alexey,
        blockId: DEMO_IDS.blocks.introVideo,
        status: 'OPENED',
        openedAt: new Date(now.getTime() - 2 * dayMs).toISOString(),
        completedAt: null,
        attempts: 0,
        score: null,
      },
    ] as BlockProgress[],
    assignments: clone(demoAssignments) as Assignment[],
    submissions: clone(demoSubmissions) as Submission[],
    /** Сдачи по Idempotency-Key: `${studentId}:${key}` → задание и ответ, отданный в первый раз. */
    submissionReplays: new Map<string, { assignmentId: string; result: SubmissionDto }>(),
    // + оплаты за недавние поступления в кошелёк Марии (world-extras): «Вам должны» и платежи
    // родителя не спорят с кошельком преподавателя.
    payments: [materializeDemoPayment(now, tzOffset), ...extras.payments] as Payment[],
    paidPeriods: [materializeDemoPaidPeriod(now, tzOffset), ...extras.paidPeriods] as PaidPeriod[],
    /** Платежи родителя по Idempotency-Key: `${parentId}:${key}` → тело и ответ первого запроса. */
    parentPayments: new Map<
      string,
      { enrollmentId: string; periodsCount: number; result: CreatePaymentResult }
    >(),
    notifications: extraNotifications,
    conversations: [clone(demoConversation), extras.parentConversation] as AiConversation[],
    /** Диалоги родителя с тьютором о ребёнке (userId — родитель, studentId — ребёнок). */
    parentConversationIds: new Set<string>([extras.parentConversation.id]),
    /** Спрос на кружки из онбординга (student_club_interests). */
    clubInterests: [] as Array<{
      studentId: string;
      clubId: string;
      status: 'CHOSEN' | 'LATER' | 'SKIPPED';
      score: number | null;
      reason: string | null;
    }>,
    messages: [...clone(demoMessages), ...extras.parentMessages] as AiMessage[],
    trajectories: [trajectory] as Trajectory[],
    generationJobs: [] as CourseGenerationJob[],
    /**
     * Загруженные файлы (мета + текст для text/*, байты картинок): владелец, подтверждение,
     * содержимое; `objectUrl` — локальная ссылка на картинку (аватар), живёт вместе с миром.
     */
    files: [] as Array<
      FileDto & {
        ownerUserId: string;
        confirmed: boolean;
        uploaded: boolean;
        text: string | null;
        blob: Blob | null;
        objectUrl: string | null;
      }
    >,
    /** Кошельки родителей (заглушка, docs/07 F13): parentId → баланс в копейках. */
    wallets: new Map<string, number>([[DEMO_IDS.parents.olga, DEMO_WALLET_START_KOPECKS]]),
    /** Пополнения по Idempotency-Key: `${parentId}:${key}` → сумма и баланс после. */
    walletTopUps: new Map<string, { amountKopecks: number; balanceAfter: number }>(),
    /**
     * Кошельки преподавателей (заглушка до PaymentProvider): teacherId → операции. Отдельно от
     * `wallets` (те — по parentId). Нет записи — пустой кошелёк (создаётся при обращении).
     */
    teacherWallets: extras.teacherWallets,
    /** Выводы по Idempotency-Key: `${teacherId}:${key}` → сумма и ответ, отданный в первый раз. */
    teacherWithdrawals: new Map<string, { amountKopecks: number; result: TeacherWithdrawal }>(),
    /** Приглашения ребёнка по ссылке (docs/07 F14). */
    invites: extras.invites as MockInvite[],
    /** maxUserId → userId для dev-входа (демо + ad-hoc пользователи). */
    maxIds: new Map<string, string>([...users.values()].map((u) => [u.maxUserId, u.id])),
  };
}

export type MockDb = ReturnType<typeof buildState>;

export let db: MockDb = buildState();

// ---------- Персист ad-hoc пользователей ----------

/**
 * Ключ localStorage с ad-hoc пользователями dev-входа («Свой пользователь»). Мир in-memory, а
 * refresh-токен мост хранит в localStorage — без персиста после reload refresh отвечал бы 401.
 */
export const MOCK_ADHOC_USERS_KEY = 'max-mock:db.adhocUsers';

interface PersistedUser {
  id: string;
  maxUserId: string;
  roles: Role[];
  createdAt: string;
}

const ROLES: readonly string[] = ['STUDENT', 'PARENT', 'TEACHER', 'SCHOOL_ADMIN'] satisfies Role[];

let persistence: Storage | null = null;

function isPersistedUser(value: unknown): value is PersistedUser {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.maxUserId === 'string' &&
    typeof v.createdAt === 'string' &&
    Array.isArray(v.roles) &&
    v.roles.every((r) => typeof r === 'string' && ROLES.includes(r))
  );
}

function readPersistedUsers(): PersistedUser[] {
  if (!persistence) return [];
  try {
    const parsed: unknown = JSON.parse(persistence.getItem(MOCK_ADHOC_USERS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isPersistedUser) : [];
  } catch {
    return [];
  }
}

/** Сохранить ad-hoc пользователя (`create`) или обновить роли уже сохранённого. */
function persistUser(user: MockUser, create = false): void {
  if (!persistence) return;
  const users = readPersistedUsers();
  const index = users.findIndex((u) => u.id === user.id);
  if (index < 0 && !create) return;
  const entry: PersistedUser = {
    id: user.id,
    maxUserId: user.maxUserId,
    roles: [...user.roles],
    createdAt: user.createdAt,
  };
  if (index < 0) users.push(entry);
  else users[index] = entry;
  try {
    persistence.setItem(MOCK_ADHOC_USERS_KEY, JSON.stringify(users));
  } catch {
    // Хранилище недоступно или переполнено — мир продолжает жить в памяти.
  }
}

/** Вернуть сохранённых ad-hoc пользователей в текущий мир (с прежними id — refresh-токены живы). */
function restorePersistedUsers(): void {
  for (const saved of readPersistedUsers()) {
    if (db.users.has(saved.id) || db.maxIds.has(saved.maxUserId)) continue;
    const user = newUser(saved.maxUserId, saved.id, saved.createdAt);
    insertUser(user);
    for (const role of saved.roles) grantRole(user, role);
  }
}

/**
 * Включить персист ad-hoc пользователей в `storage` (по умолчанию localStorage) и восстановить
 * сохранённых. Вызывается только из `browser.ts` до `setupWorker`; тесты (msw/node) живут без
 * него. `null` — выключить.
 */
export function enableMockPersistence(storage?: Storage | null): void {
  if (storage === undefined) {
    try {
      persistence = globalThis.localStorage ?? null;
    } catch {
      persistence = null;
    }
  } else {
    persistence = storage;
  }
  restorePersistedUsers();
}

/**
 * Сброс мира (для тестов и dev-кнопки). Ad-hoc пользователи из персиста возвращаются в новый мир;
 * `clearPersisted: true` — забыть и их.
 */
export function resetMockDb(options: { clearPersisted?: boolean } = {}): void {
  if (options.clearPersisted && persistence) {
    try {
      persistence.removeItem(MOCK_ADHOC_USERS_KEY);
    } catch {
      // Хранилище недоступно — забывать нечего.
    }
  }
  db = buildState();
  restorePersistedUsers();
}

export function findUserByMaxId(maxUserId: string): MockUser | undefined {
  const id = db.maxIds.get(maxUserId);
  return id ? db.users.get(id) : undefined;
}

function newUser(maxUserId: string, id: string, createdAt: string): MockUser {
  return {
    id,
    maxUserId,
    // Как у пользователя MAX без имени: экраны показывают нейтральный текст, а не maxUserId.
    firstName: '',
    lastName: null,
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt,
    roles: [],
  };
}

function insertUser(user: MockUser): void {
  db.users.set(user.id, user);
  db.maxIds.set(user.maxUserId, user.id);
}

/** Ad-hoc пользователь для dev-входа с незнакомым maxUserId. */
export function createUser(maxUserId: string, roles: Role[]): MockUser {
  const user = newUser(maxUserId, crypto.randomUUID(), new Date().toISOString());
  insertUser(user);
  for (const role of roles) grantRole(user, role);
  persistUser(user, true);
  return user;
}

const LINK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Код привязки ученика: 6 символов без неоднозначных 0/O/1/I, уникальный среди учеников. */
export function linkCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: 6 },
      () => LINK_ALPHABET[Math.floor(Math.random() * LINK_ALPHABET.length)],
    ).join('');
  } while (db.students.some((s) => s.linkCode === code));
  return code;
}

/** Выдать роль и создать профиль, если его нет (как IdentityService.grantRole). */
export function grantRole(user: MockUser, role: Role): void {
  if (!user.roles.includes(role)) {
    user.roles.push(role);
    persistUser(user);
  }
  switch (role) {
    case 'STUDENT':
      if (!db.students.some((s) => s.userId === user.id)) {
        db.students.push({
          id: crypto.randomUUID(),
          userId: user.id,
          schoolId: null,
          classLabel: null,
          birthYear: null,
          interests: [],
          goals: [],
          weeklyHours: null,
          preferredFormats: [],
          futureInterests: [],
          aiProfileSummary: null,
          onboardingCompletedAt: null,
          linkCode: linkCode(),
        });
      }
      return;
    case 'PARENT':
      if (!db.parents.some((p) => p.userId === user.id)) {
        db.parents.push({ id: crypto.randomUUID(), userId: user.id });
      }
      return;
    case 'TEACHER':
      if (!db.teachers.some((t) => t.userId === user.id)) {
        db.teachers.push({
          id: crypto.randomUUID(),
          userId: user.id,
          schoolId: DEMO_IDS.school,
          qualification: null,
          bio: null,
          photoUrl: null,
          contactsVisible: false,
        });
      }
      return;
    case 'SCHOOL_ADMIN':
      return;
  }
}

export const studentOfUser = (userId: string) => db.students.find((s) => s.userId === userId);
export const parentOfUser = (userId: string) => db.parents.find((p) => p.userId === userId);
export const teacherOfUser = (userId: string) => db.teachers.find((t) => t.userId === userId);
