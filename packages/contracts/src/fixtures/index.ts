/**
 * Демо-мир: единый набор данных для seed (packages/db) и MSW-моков (apps/web).
 * Владелец — contracts. Данных намеренно мало: 1 школа, 2 кружка, 2 группы, 1 преподаватель
 * (он же родитель), 2 ученика, 1 родитель, курс с 4 блоками, 3 задания, сдача, посещаемость.
 *
 * Даты занятий задаются смещением в днях от «сейчас» — см. materializeDemoLessons().
 */
import type {
  Assignment,
  AiConversation,
  AiMessage,
  Attendance,
  Club,
  Course,
  CourseBlock,
  CourseModule,
  Enrollment,
  Group,
  Lesson,
  Notification,
  ParentProfile,
  ParentStudentLink,
  PaidPeriod,
  Payment,
  ScheduleRule,
  School,
  StudentProfile,
  Submission,
  TeacherProfile,
  User,
} from '../entities';
import type { Role } from '../enums';

/** Детерминированный uuid v7-подобного формата по номеру. */
export function demoId(n: number): string {
  return `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

const T0 = '2026-09-01T00:00:00.000Z';

export const DEMO_IDS = {
  school: demoId(1),
  users: {
    teacher: demoId(10),
    student1: demoId(11),
    student2: demoId(12),
    parent: demoId(13),
  },
  teachers: { maria: demoId(20) },
  students: { alexey: demoId(21), dasha: demoId(22) },
  parents: { olga: demoId(23), mariaAsParent: demoId(24) },
  clubs: { robotics: demoId(30), programming: demoId(31) },
  groups: { roboticsA: demoId(40), programmingA: demoId(41) },
  enrollments: {
    alexeyRobotics: demoId(50),
    dashaRobotics: demoId(51),
    alexeyProgramming: demoId(52),
  },
  scheduleRules: { roboticsMon: demoId(60), roboticsThu: demoId(61), programmingTue: demoId(62) },
  lessons: {
    roboticsPast1: demoId(70),
    roboticsPast2: demoId(71),
    roboticsToday: demoId(72),
    roboticsNext: demoId(73),
    programmingTomorrow: demoId(74),
  },
  course: demoId(80),
  modules: { intro: demoId(81), sensors: demoId(82) },
  blocks: {
    introText: demoId(90),
    introVideo: demoId(91),
    sensorsQuiz: demoId(92),
    sensorsHomework: demoId(93),
  },
  assignments: { quiz: demoId(100), homework: demoId(101), simpleHomework: demoId(102) },
  submissions: { alexeySimpleHomework: demoId(110) },
  attendance: {
    p1Alexey: demoId(120),
    p1Dasha: demoId(121),
    p2Alexey: demoId(122),
    p2Dasha: demoId(123),
  },
  conversation: demoId(130),
  messages: { m1: demoId(131), m2: demoId(132) },
  payment: demoId(140),
  paidPeriod: demoId(141),
  notification: demoId(150),
} as const;

export type DemoUser = User & { maxUserId: string; roles: Role[] };

export const demoSchool: School = {
  id: DEMO_IDS.school,
  name: 'Школа № 1 (демо)',
  timezone: 'Europe/Moscow',
  settings: { showTeacherContacts: true },
};

export const demoUsers: Record<keyof typeof DEMO_IDS.users, DemoUser> = {
  teacher: {
    id: DEMO_IDS.users.teacher,
    maxUserId: 'max-teacher-1',
    firstName: 'Мария',
    lastName: 'Иванова',
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: T0,
    roles: ['TEACHER', 'PARENT'],
  },
  student1: {
    id: DEMO_IDS.users.student1,
    maxUserId: 'max-student-1',
    firstName: 'Алексей',
    lastName: 'Смирнов',
    nickname: 'alex',
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: T0,
    roles: ['STUDENT'],
  },
  student2: {
    id: DEMO_IDS.users.student2,
    maxUserId: 'max-student-2',
    firstName: 'Даша',
    lastName: 'Иванова',
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: T0,
    roles: ['STUDENT'],
  },
  parent: {
    id: DEMO_IDS.users.parent,
    maxUserId: 'max-parent-1',
    firstName: 'Ольга',
    lastName: 'Смирнова',
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: T0,
    roles: ['PARENT'],
  },
};

export const demoTeachers: TeacherProfile[] = [
  {
    id: DEMO_IDS.teachers.maria,
    userId: DEMO_IDS.users.teacher,
    schoolId: DEMO_IDS.school,
    qualification: 'Педагог дополнительного образования, робототехника и программирование',
    bio: 'Веду кружки робототехники и Python с 2019 года.',
    photoUrl: null,
    contactsVisible: true,
  },
];
export const demoTeacherContacts: Record<string, { phone: string | null; email: string | null }> = {
  [DEMO_IDS.teachers.maria]: { phone: '+7 900 000-00-00', email: 'maria@example.com' },
};

export const demoStudents: StudentProfile[] = [
  {
    id: DEMO_IDS.students.alexey,
    userId: DEMO_IDS.users.student1,
    schoolId: DEMO_IDS.school,
    classLabel: '7Б',
    birthYear: 2013,
    interests: ['роботы', 'игры', 'программирование'],
    goals: ['научиться программировать'],
    weeklyHours: 4,
    preferredFormats: ['практика', 'проекты'],
    futureInterests: ['3D-моделирование'],
    aiProfileSummary: 'Интересуется робототехникой и программированием, любит практические задачи.',
    onboardingCompletedAt: T0,
    linkCode: 'ALX123',
  },
  {
    id: DEMO_IDS.students.dasha,
    userId: DEMO_IDS.users.student2,
    schoolId: DEMO_IDS.school,
    classLabel: '7Б',
    birthYear: 2013,
    interests: ['рисование', 'роботы'],
    goals: [],
    weeklyHours: null,
    preferredFormats: [],
    futureInterests: [],
    aiProfileSummary: null,
    onboardingCompletedAt: null,
    linkCode: 'DSH456',
  },
];

export const demoParents: ParentProfile[] = [
  { id: DEMO_IDS.parents.olga, userId: DEMO_IDS.users.parent },
  { id: DEMO_IDS.parents.mariaAsParent, userId: DEMO_IDS.users.teacher },
];

export const demoParentLinks: ParentStudentLink[] = [
  {
    parentId: DEMO_IDS.parents.olga,
    studentId: DEMO_IDS.students.alexey,
    status: 'ACTIVE',
    requestedAt: T0,
    confirmedAt: T0,
  },
  {
    parentId: DEMO_IDS.parents.olga,
    studentId: DEMO_IDS.students.dasha,
    status: 'ACTIVE',
    requestedAt: T0,
    confirmedAt: T0,
  },
  {
    parentId: DEMO_IDS.parents.mariaAsParent,
    studentId: DEMO_IDS.students.dasha,
    status: 'ACTIVE',
    requestedAt: T0,
    confirmedAt: T0,
  },
];

export const demoClubs: Club[] = [
  {
    id: DEMO_IDS.clubs.robotics,
    schoolId: DEMO_IDS.school,
    title: 'Робототехника',
    description: 'Собираем и программируем роботов на Arduino.',
    category: 'ROBOTICS',
    coverUrl: null,
    price: { amountKopecks: 350000, currency: 'RUB' },
    billingPeriod: 'MONTH',
    isActive: true,
    tags: ['arduino', 'электроника', 'проекты'],
  },
  {
    id: DEMO_IDS.clubs.programming,
    schoolId: DEMO_IDS.school,
    title: 'Программирование на Python',
    description: 'От первых программ до небольших игр.',
    category: 'PROGRAMMING',
    coverUrl: null,
    price: { amountKopecks: 300000, currency: 'RUB' },
    billingPeriod: 'MONTH',
    isActive: true,
    tags: ['python', 'игры', 'алгоритмы'],
  },
];

export const demoGroups: Group[] = [
  {
    id: DEMO_IDS.groups.roboticsA,
    clubId: DEMO_IDS.clubs.robotics,
    teacherId: DEMO_IDS.teachers.maria,
    title: 'Робототехника, группа А',
    isActive: true,
  },
  {
    id: DEMO_IDS.groups.programmingA,
    clubId: DEMO_IDS.clubs.programming,
    teacherId: DEMO_IDS.teachers.maria,
    title: 'Python, группа А',
    isActive: true,
  },
];

export const demoEnrollments: Enrollment[] = [
  {
    id: DEMO_IDS.enrollments.alexeyRobotics,
    studentId: DEMO_IDS.students.alexey,
    groupId: DEMO_IDS.groups.roboticsA,
    status: 'ACTIVE',
    enrolledAt: T0,
    leftAt: null,
  },
  {
    id: DEMO_IDS.enrollments.dashaRobotics,
    studentId: DEMO_IDS.students.dasha,
    groupId: DEMO_IDS.groups.roboticsA,
    status: 'ACTIVE',
    enrolledAt: T0,
    leftAt: null,
  },
  {
    id: DEMO_IDS.enrollments.alexeyProgramming,
    studentId: DEMO_IDS.students.alexey,
    groupId: DEMO_IDS.groups.programmingA,
    status: 'ACTIVE',
    enrolledAt: T0,
    leftAt: null,
  },
];

export const demoScheduleRules: ScheduleRule[] = [
  {
    id: DEMO_IDS.scheduleRules.roboticsMon,
    groupId: DEMO_IDS.groups.roboticsA,
    weekday: 1,
    startTime: '15:00',
    endTime: '16:30',
    room: 'Каб. 12',
    validFrom: '2026-09-01',
    validTo: null,
  },
  {
    id: DEMO_IDS.scheduleRules.roboticsThu,
    groupId: DEMO_IDS.groups.roboticsA,
    weekday: 4,
    startTime: '15:00',
    endTime: '16:30',
    room: 'Каб. 12',
    validFrom: '2026-09-01',
    validTo: null,
  },
  {
    id: DEMO_IDS.scheduleRules.programmingTue,
    groupId: DEMO_IDS.groups.programmingA,
    weekday: 2,
    startTime: '16:00',
    endTime: '17:00',
    room: 'Каб. 5',
    validFrom: '2026-09-01',
    validTo: null,
  },
];

/** Занятия относительно «сейчас»: dayOffset — дней от сегодняшней даты, время — локальное для школы. */
export interface DemoLessonSpec {
  id: string;
  groupId: string;
  ruleId: string | null;
  dayOffset: number;
  startTime: string;
  durationMin: number;
  topic: string | null;
  room: string | null;
  status: Lesson['status'];
}

export const demoLessonSpecs: DemoLessonSpec[] = [
  {
    id: DEMO_IDS.lessons.roboticsPast1,
    groupId: DEMO_IDS.groups.roboticsA,
    ruleId: DEMO_IDS.scheduleRules.roboticsMon,
    dayOffset: -7,
    startTime: '15:00',
    durationMin: 90,
    topic: 'Знакомство с Arduino',
    room: 'Каб. 12',
    status: 'DONE',
  },
  {
    id: DEMO_IDS.lessons.roboticsPast2,
    groupId: DEMO_IDS.groups.roboticsA,
    ruleId: DEMO_IDS.scheduleRules.roboticsThu,
    dayOffset: -3,
    startTime: '15:00',
    durationMin: 90,
    topic: 'Светодиоды и кнопки',
    room: 'Каб. 12',
    status: 'DONE',
  },
  {
    id: DEMO_IDS.lessons.roboticsToday,
    groupId: DEMO_IDS.groups.roboticsA,
    ruleId: null,
    dayOffset: 0,
    startTime: '15:00',
    durationMin: 90,
    topic: 'Датчики расстояния',
    room: 'Каб. 12',
    status: 'PLANNED',
  },
  {
    id: DEMO_IDS.lessons.roboticsNext,
    groupId: DEMO_IDS.groups.roboticsA,
    ruleId: null,
    dayOffset: 4,
    startTime: '15:00',
    durationMin: 90,
    topic: 'Моторы и движение',
    room: 'Каб. 12',
    status: 'PLANNED',
  },
  {
    id: DEMO_IDS.lessons.programmingTomorrow,
    groupId: DEMO_IDS.groups.programmingA,
    ruleId: null,
    dayOffset: 1,
    startTime: '16:00',
    durationMin: 60,
    topic: 'Циклы в Python',
    room: 'Каб. 5',
    status: 'PLANNED',
  },
];

/**
 * Превращает спецификации занятий в Lesson с абсолютными датами.
 * @param now — точка отсчёта; @param tzOffsetMinutes — смещение часового пояса школы от UTC (Москва: 180)
 */
export function materializeDemoLessons(now: Date = new Date(), tzOffsetMinutes = 180): Lesson[] {
  return demoLessonSpecs.map((spec) => {
    const [h, m] = spec.startTime.split(':').map(Number) as [number, number];
    // День берём по часам школы, а не по UTC: иначе с 00:00 до 03:00 МСК «сегодня» уезжает на вчера.
    const local = new Date(now.getTime() + tzOffsetMinutes * 60_000);
    const base = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + spec.dayOffset),
    );
    const startsAt = new Date(base.getTime() + (h * 60 + m - tzOffsetMinutes) * 60_000);
    const endsAt = new Date(startsAt.getTime() + spec.durationMin * 60_000);
    return {
      id: spec.id,
      groupId: spec.groupId,
      ruleId: spec.ruleId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      topic: spec.topic,
      room: spec.room,
      status: spec.status,
      cancelReason: null,
    };
  });
}

export const demoAttendance: Attendance[] = [
  {
    id: DEMO_IDS.attendance.p1Alexey,
    lessonId: DEMO_IDS.lessons.roboticsPast1,
    studentId: DEMO_IDS.students.alexey,
    status: 'PRESENT',
    comment: null,
    markedById: DEMO_IDS.teachers.maria,
    markedAt: T0,
  },
  {
    id: DEMO_IDS.attendance.p1Dasha,
    lessonId: DEMO_IDS.lessons.roboticsPast1,
    studentId: DEMO_IDS.students.dasha,
    status: 'ABSENT',
    comment: 'Болела',
    markedById: DEMO_IDS.teachers.maria,
    markedAt: T0,
  },
  {
    id: DEMO_IDS.attendance.p2Alexey,
    lessonId: DEMO_IDS.lessons.roboticsPast2,
    studentId: DEMO_IDS.students.alexey,
    status: 'PRESENT',
    comment: null,
    markedById: DEMO_IDS.teachers.maria,
    markedAt: T0,
  },
  {
    id: DEMO_IDS.attendance.p2Dasha,
    lessonId: DEMO_IDS.lessons.roboticsPast2,
    studentId: DEMO_IDS.students.dasha,
    status: 'LATE',
    comment: null,
    markedById: DEMO_IDS.teachers.maria,
    markedAt: T0,
  },
];

export const demoCourse: Course = {
  id: DEMO_IDS.course,
  groupId: DEMO_IDS.groups.roboticsA,
  teacherId: DEMO_IDS.teachers.maria,
  title: 'Основы робототехники',
  description: 'Первые шаги: плата, датчики, движение.',
  status: 'PUBLISHED',
  version: 1,
  publishedAt: T0,
  generationJobId: null,
};

export const demoModules: CourseModule[] = [
  {
    id: DEMO_IDS.modules.intro,
    courseId: DEMO_IDS.course,
    order: 0,
    title: 'Знакомство с платой',
    summary: 'Что такое Arduino и как её подключить.',
  },
  {
    id: DEMO_IDS.modules.sensors,
    courseId: DEMO_IDS.course,
    order: 1,
    title: 'Датчики',
    summary: 'Считываем данные с датчиков.',
  },
];

export const demoBlocks: CourseBlock[] = [
  {
    id: DEMO_IDS.blocks.introText,
    moduleId: DEMO_IDS.modules.intro,
    order: 0,
    type: 'TEXT',
    title: 'Что такое Arduino',
    estimatedMinutes: 10,
    isRequired: true,
    content: {
      markdown:
        '# Arduino\n\nArduino — это небольшая плата с микроконтроллером, которую можно программировать.',
    },
  },
  {
    id: DEMO_IDS.blocks.introVideo,
    moduleId: DEMO_IDS.modules.intro,
    order: 1,
    type: 'VIDEO',
    title: 'Подключаем плату',
    estimatedMinutes: 8,
    isRequired: false,
    content: {
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      durationSec: 480,
    },
  },
  {
    id: DEMO_IDS.blocks.sensorsQuiz,
    moduleId: DEMO_IDS.modules.sensors,
    order: 0,
    type: 'QUIZ',
    title: 'Проверь себя: датчики',
    estimatedMinutes: 5,
    isRequired: true,
    content: {
      passScore: 60,
      questions: [
        {
          id: 'q1',
          text: 'Какой датчик измеряет расстояние?',
          options: [
            { id: 'a', text: 'Ультразвуковой' },
            { id: 'b', text: 'Температурный' },
            { id: 'c', text: 'Фоторезистор' },
          ],
          correctOptionIds: ['a'],
          explanation: 'Ультразвуковой датчик измеряет время отражения звука.',
          multiple: false,
        },
        {
          id: 'q2',
          text: 'Что нужно для подключения датчика к плате?',
          options: [
            { id: 'a', text: 'Провода' },
            { id: 'b', text: 'Питание' },
            { id: 'c', text: 'Интернет' },
          ],
          correctOptionIds: ['a', 'b'],
          multiple: true,
        },
      ],
    },
  },
  {
    id: DEMO_IDS.blocks.sensorsHomework,
    moduleId: DEMO_IDS.modules.sensors,
    order: 1,
    type: 'HOMEWORK',
    title: 'Домашнее задание: схема с датчиком',
    estimatedMinutes: 30,
    isRequired: true,
    content: {
      instructions: 'Нарисуй схему подключения ультразвукового датчика и сфотографируй.',
      submissionType: 'BOTH',
    },
  },
];

export const demoAssignments: Assignment[] = [
  {
    id: DEMO_IDS.assignments.quiz,
    groupId: DEMO_IDS.groups.roboticsA,
    teacherId: DEMO_IDS.teachers.maria,
    courseId: DEMO_IDS.course,
    blockId: DEMO_IDS.blocks.sensorsQuiz,
    title: 'Проверь себя: датчики',
    description: null,
    type: 'QUIZ',
    dueAt: null,
    maxScore: 100,
    allowedAttempts: 3,
    publishedAt: T0,
  },
  {
    id: DEMO_IDS.assignments.homework,
    groupId: DEMO_IDS.groups.roboticsA,
    teacherId: DEMO_IDS.teachers.maria,
    courseId: DEMO_IDS.course,
    blockId: DEMO_IDS.blocks.sensorsHomework,
    title: 'Домашнее задание: схема с датчиком',
    description: 'Нарисуй схему подключения ультразвукового датчика и сфотографируй.',
    type: 'HOMEWORK',
    dueAt: null,
    maxScore: 100,
    allowedAttempts: null,
    publishedAt: T0,
  },
  {
    id: DEMO_IDS.assignments.simpleHomework,
    groupId: DEMO_IDS.groups.programmingA,
    teacherId: DEMO_IDS.teachers.maria,
    courseId: null,
    blockId: null,
    title: 'Задачи 1–10, стр. 52',
    description: 'До пятницы решить задачи 1–10 на странице 52.',
    type: 'HOMEWORK',
    dueAt: null,
    maxScore: 100,
    allowedAttempts: null,
    publishedAt: T0,
  },
];

/** Дедлайны заданий относительно «сейчас» (дней), применяются при seed/моках. */
export const demoAssignmentDueOffsets: Record<string, number> = {
  [DEMO_IDS.assignments.homework]: 5,
  [DEMO_IDS.assignments.simpleHomework]: 2,
};

export const demoSubmissions: Submission[] = [
  {
    id: DEMO_IDS.submissions.alexeySimpleHomework,
    assignmentId: DEMO_IDS.assignments.simpleHomework,
    studentId: DEMO_IDS.students.alexey,
    status: 'GRADED',
    attemptsCount: 1,
    score: 85,
    answers: { text: 'Решил все, кроме 7-й.' },
    fileIds: [],
    text: 'Решил все, кроме 7-й.',
    submittedAt: T0,
    gradedAt: T0,
    gradedById: DEMO_IDS.teachers.maria,
    feedback: 'Хорошо. Посмотри 7-ю задачу ещё раз.',
    isLate: false,
  },
];

export const demoConversation: AiConversation = {
  id: DEMO_IDS.conversation,
  userId: DEMO_IDS.users.student1,
  studentId: DEMO_IDS.students.alexey,
  kind: 'TUTOR',
  title: 'Что мне сделать сегодня?',
  lastMessageAt: T0,
  createdAt: T0,
};

export const demoMessages: AiMessage[] = [
  {
    id: DEMO_IDS.messages.m1,
    conversationId: DEMO_IDS.conversation,
    role: 'USER',
    content: 'Что мне сегодня нужно сделать?',
    createdAt: T0,
  },
  {
    id: DEMO_IDS.messages.m2,
    conversationId: DEMO_IDS.conversation,
    role: 'ASSISTANT',
    content:
      'Сегодня в 15:00 занятие по робототехнике. Ещё не сдано задание по Python — задачи 1–10.',
    createdAt: T0,
  },
];

export const demoPayment: Payment = {
  id: DEMO_IDS.payment,
  parentId: DEMO_IDS.parents.olga,
  studentId: DEMO_IDS.students.alexey,
  enrollmentId: DEMO_IDS.enrollments.alexeyRobotics,
  amount: { amountKopecks: 350000, currency: 'RUB' },
  status: 'SUCCEEDED',
  provider: 'fake',
  periodsCount: 1,
  confirmationUrl: null,
  createdAt: T0,
  paidAt: T0,
  failReason: null,
};

export const demoPaidPeriod: PaidPeriod = {
  id: DEMO_IDS.paidPeriod,
  enrollmentId: DEMO_IDS.enrollments.alexeyRobotics,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  paymentId: DEMO_IDS.payment,
};

export const demoNotification: Notification = {
  id: DEMO_IDS.notification,
  type: 'ASSIGNMENT_NEW',
  title: 'Новое задание',
  body: 'Задачи 1–10, стр. 52',
  payload: {
    entityType: 'assignment',
    entityId: DEMO_IDS.assignments.simpleHomework,
    route: `/student/assignments/${DEMO_IDS.assignments.simpleHomework}`,
  },
  readAt: null,
  createdAt: T0,
};
/** Кому адресовано демо-уведомление (User.id). */
export const demoNotificationUserId = DEMO_IDS.users.student1;

/** Все пользователи для dev-входа: кого можно выбрать на экране «Войти как». */
export const demoLoginUsers = Object.values(demoUsers).map((u) => ({
  id: u.id,
  maxUserId: u.maxUserId,
  name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
  roles: u.roles,
}));
