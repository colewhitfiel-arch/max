/**
 * Изменяемое состояние демо-мира для MSW: копии фикстур + то, что меняют мутации
 * (сессии, настройки, привязки, прогресс, сдачи, уведомления, диалоги). Живёт до перезагрузки.
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
  Enrollment,
  FileDto,
  Group,
  Lesson,
  Notification as NotificationEntity,
  PaidPeriod,
  ParentProfile,
  ParentStudentLink,
  Payment,
  Role,
  ScheduleRule,
  StudentProfile,
  Submission,
  TeacherProfile,
  Trajectory,
  UserSettings,
} from '@edu/contracts';
import {
  DEMO_IDS,
  type DemoUser,
  demoAssignments,
  demoAttendance,
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
  demoPaidPeriod,
  demoParentLinks,
  demoParents,
  demoPayment,
  demoScheduleRules,
  demoStudents,
  demoSubmissions,
  demoTeachers,
  demoUsers,
  materializeDemoLessons,
} from '@edu/contracts/fixtures';

export type MockUser = DemoUser;
export type MockNotification = NotificationEntity & { userId: string };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildState() {
  const users = new Map<string, MockUser>();
  for (const user of Object.values(demoUsers)) users.set(user.id, clone(user));
  const now = new Date();
  const dayMs = 86_400_000;

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
    teachers: clone(demoTeachers) as TeacherProfile[],
    links: clone(demoParentLinks) as ParentStudentLink[],
    settings: new Map<string, UserSettings>(),
    clubs: clone(demoClubs) as Club[],
    groups: clone(demoGroups) as Group[],
    enrollments: clone(demoEnrollments) as Enrollment[],
    scheduleRules: clone(demoScheduleRules) as ScheduleRule[],
    lessons: materializeDemoLessons(now) as Lesson[],
    attendance: clone(demoAttendance) as Attendance[],
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
    payments: [clone(demoPayment)] as Payment[],
    paidPeriods: [clone(demoPaidPeriod)] as PaidPeriod[],
    notifications: extraNotifications,
    conversations: [clone(demoConversation)] as AiConversation[],
    messages: clone(demoMessages) as AiMessage[],
    trajectories: [trajectory] as Trajectory[],
    generationJobs: [] as CourseGenerationJob[],
    /** Загруженные файлы (мета + текст для text/*): владелец, подтверждение, содержимое. */
    files: [] as Array<
      FileDto & { ownerUserId: string; confirmed: boolean; uploaded: boolean; text: string | null }
    >,
    /** userId → maxUserId для ad-hoc dev-пользователей. */
    maxIds: new Map<string, string>(Object.values(demoUsers).map((u) => [u.maxUserId, u.id])),
  };
}

export type MockDb = ReturnType<typeof buildState>;

export let db: MockDb = buildState();

/** Сброс мира (для тестов и dev-кнопки). */
export function resetMockDb(): void {
  db = buildState();
}

export function findUserByMaxId(maxUserId: string): MockUser | undefined {
  const id = db.maxIds.get(maxUserId);
  return id ? db.users.get(id) : undefined;
}

/** Ad-hoc пользователь для dev-входа с незнакомым maxUserId. */
export function createUser(maxUserId: string, roles: Role[]): MockUser {
  const user: MockUser = {
    id: crypto.randomUUID(),
    maxUserId,
    firstName: maxUserId,
    lastName: null,
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: new Date().toISOString(),
    roles: [],
  };
  db.users.set(user.id, user);
  db.maxIds.set(maxUserId, user.id);
  for (const role of roles) grantRole(user, role);
  return user;
}

const LINK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function linkCode(): string {
  return Array.from(
    { length: 6 },
    () => LINK_ALPHABET[Math.floor(Math.random() * LINK_ALPHABET.length)],
  ).join('');
}

/** Выдать роль и создать профиль, если его нет (как IdentityService.grantRole). */
export function grantRole(user: MockUser, role: Role): void {
  if (!user.roles.includes(role)) user.roles.push(role);
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
