/**
 * Дополнения демо-мира только для MSW (не фикстуры и не seed): «Шахматы» у Даши — как в макете
 * главной родителя, ещё два кружка для витрины «Кружки для ваших детей», кошельки родителей,
 * приглашения по ссылке и диалог родителя с тьютором. Собирается в `state.ts` при каждом сбросе.
 */
import type {
  AiConversation,
  AiMessage,
  Attendance,
  Club,
  Enrollment,
  Group,
  Lesson,
  ScheduleRule,
  TeacherProfile,
} from '@edu/contracts';
import { DEMO_IDS, type DemoLessonSpec, type DemoUser, demoId } from '@edu/contracts/fixtures';

const DAY_MS = 86_400_000;
const T0 = '2026-09-01T00:00:00.000Z';

/** Id сущностей, которых нет в фикстурах (диапазон 0x200+ не пересекается с demoId фикстур). */
export const MOCK_IDS = {
  users: { chessTeacher: demoId(0x200), englishTeacher: demoId(0x201) },
  teachers: { andrey: demoId(0x210), elena: demoId(0x211) },
  clubs: { chess: demoId(0x220), math: demoId(0x221), english: demoId(0x222) },
  groups: { chessA: demoId(0x230), mathA: demoId(0x231), englishA: demoId(0x232) },
  enrollments: { dashaChess: demoId(0x240) },
  scheduleRules: {
    chessMon: demoId(0x250),
    chessWed: demoId(0x251),
    mathSat: demoId(0x252),
    englishTue: demoId(0x253),
  },
  lessons: {
    chessPast1: demoId(0x260),
    chessPast2: demoId(0x261),
    chessToday: demoId(0x262),
    chessNext1: demoId(0x263),
    chessNext2: demoId(0x264),
  },
  attendance: { chessPast1Dasha: demoId(0x270), chessPast2Dasha: demoId(0x271) },
  parentConversation: demoId(0x280),
  parentMessages: { m1: demoId(0x281), m2: demoId(0x282) },
} as const;

/**
 * Готовые приглашения для ручной проверки `/invite/:token`: действующее — от Марии (родитель
 * Даши, Алексей может принять), истёкшее — от Ольги.
 */
export const MOCK_INVITE_TOKENS = {
  pending: 'demo-invite-pending-maria',
  expired: 'demo-invite-expired-olga',
} as const;

/** Стартовый баланс кошелька демо-родителя (Ольга), в копейках: 6 700 ₽ — как в макете. */
export const DEMO_WALLET_START_KOPECKS = 670_000;

/** Приглашение ребёнка по ссылке (модель ParentInvite из docs/04 — пока только в моках). */
export interface MockInvite {
  token: string;
  parentId: string;
  createdAt: string;
  expiresAt: string;
  acceptedByStudentId: string | null;
  acceptedAt: string | null;
}

const mockUsers: DemoUser[] = [
  {
    id: MOCK_IDS.users.chessTeacher,
    maxUserId: 'max-teacher-2',
    firstName: 'Андрей',
    lastName: 'Петров',
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: T0,
    roles: ['TEACHER'],
  },
  {
    id: MOCK_IDS.users.englishTeacher,
    maxUserId: 'max-teacher-3',
    firstName: 'Елена',
    lastName: 'Соколова',
    nickname: null,
    avatarUrl: null,
    locale: 'ru',
    theme: 'SYSTEM',
    createdAt: T0,
    roles: ['TEACHER'],
  },
];

const mockTeachers: TeacherProfile[] = [
  {
    id: MOCK_IDS.teachers.andrey,
    userId: MOCK_IDS.users.chessTeacher,
    schoolId: DEMO_IDS.school,
    qualification: 'Кандидат в мастера спорта по шахматам, педагог по математике',
    bio: 'Учу видеть комбинации и не бояться сложных задач.',
    photoUrl: null,
    contactsVisible: false,
  },
  {
    id: MOCK_IDS.teachers.elena,
    userId: MOCK_IDS.users.englishTeacher,
    schoolId: DEMO_IDS.school,
    qualification: 'Преподаватель английского языка, CELTA',
    bio: 'Разговорный английский через игры и проекты.',
    photoUrl: null,
    contactsVisible: false,
  },
];

const mockClubs: Club[] = [
  {
    id: MOCK_IDS.clubs.chess,
    schoolId: DEMO_IDS.school,
    title: 'Шахматы',
    description: 'Тактика, дебюты и турнирная практика: учимся думать на несколько ходов вперёд.',
    category: 'CHESS',
    coverUrl: null,
    price: { amountKopecks: 250_000, currency: 'RUB' },
    billingPeriod: 'MONTH',
    isActive: true,
    tags: ['тактика', 'турниры', 'логика'],
  },
  {
    id: MOCK_IDS.clubs.math,
    schoolId: DEMO_IDS.school,
    title: 'Олимпиадная математика',
    description: 'Нестандартные задачи, логика и подготовка к олимпиадам.',
    category: 'MATH',
    coverUrl: null,
    price: { amountKopecks: 280_000, currency: 'RUB' },
    billingPeriod: 'MONTH',
    isActive: true,
    tags: ['олимпиады', 'логика', 'задачи'],
  },
  {
    id: MOCK_IDS.clubs.english,
    schoolId: DEMO_IDS.school,
    title: 'Английский язык',
    description: 'Разговорный английский в игровой форме, небольшие группы.',
    category: 'LANGUAGES',
    coverUrl: null,
    price: { amountKopecks: 320_000, currency: 'RUB' },
    billingPeriod: 'MONTH',
    isActive: true,
    tags: ['разговорный', 'игры', 'A1–B1'],
  },
];

const mockGroups: Group[] = [
  {
    id: MOCK_IDS.groups.chessA,
    clubId: MOCK_IDS.clubs.chess,
    teacherId: MOCK_IDS.teachers.andrey,
    title: 'Шахматы, группа А',
    isActive: true,
  },
  {
    id: MOCK_IDS.groups.mathA,
    clubId: MOCK_IDS.clubs.math,
    teacherId: MOCK_IDS.teachers.andrey,
    title: 'Олимпиадная математика, группа А',
    isActive: true,
  },
  {
    id: MOCK_IDS.groups.englishA,
    clubId: MOCK_IDS.clubs.english,
    teacherId: MOCK_IDS.teachers.elena,
    title: 'Английский, группа А',
    isActive: true,
  },
];

const mockEnrollments: Enrollment[] = [
  {
    id: MOCK_IDS.enrollments.dashaChess,
    studentId: DEMO_IDS.students.dasha,
    groupId: MOCK_IDS.groups.chessA,
    status: 'ACTIVE',
    enrolledAt: T0,
    leftAt: null,
  },
];

const rule = (
  id: string,
  groupId: string,
  weekday: number,
  startTime: string,
  endTime: string,
  room: string,
): ScheduleRule => ({
  id,
  groupId,
  weekday,
  startTime,
  endTime,
  room,
  validFrom: '2026-09-01',
  validTo: null,
});

const mockScheduleRules: ScheduleRule[] = [
  rule(MOCK_IDS.scheduleRules.chessMon, MOCK_IDS.groups.chessA, 1, '19:00', '20:30', 'Каб. 7'),
  rule(MOCK_IDS.scheduleRules.chessWed, MOCK_IDS.groups.chessA, 3, '19:00', '20:30', 'Каб. 7'),
  rule(MOCK_IDS.scheduleRules.mathSat, MOCK_IDS.groups.mathA, 6, '11:00', '12:30', 'Каб. 3'),
  rule(MOCK_IDS.scheduleRules.englishTue, MOCK_IDS.groups.englishA, 2, '17:30', '18:30', 'Каб. 9'),
];

/** Занятия «Шахмат» относительно «сейчас»: сегодня в 19:00 — как в макете главной родителя. */
const chessLessonSpecs: DemoLessonSpec[] = [
  { dayOffset: -5, id: MOCK_IDS.lessons.chessPast1, topic: 'Открытые линии', status: 'DONE' },
  { dayOffset: -2, id: MOCK_IDS.lessons.chessPast2, topic: 'Вилки и связки', status: 'DONE' },
  { dayOffset: 0, id: MOCK_IDS.lessons.chessToday, topic: 'Мат в два хода', status: 'PLANNED' },
  {
    dayOffset: 2,
    id: MOCK_IDS.lessons.chessNext1,
    topic: 'Эндшпиль: король и пешка',
    status: 'PLANNED',
  },
  { dayOffset: 5, id: MOCK_IDS.lessons.chessNext2, topic: 'Турнирная практика', status: 'PLANNED' },
].map((spec) => ({
  ...spec,
  groupId: MOCK_IDS.groups.chessA,
  ruleId: null,
  startTime: '19:00',
  durationMin: 90,
  room: 'Каб. 7',
  status: spec.status as Lesson['status'],
}));

/** Как `materializeDemoLessons` из фикстур: смещение в днях + локальное время по поясу `tzOffsetMinutes`. */
function materialize(specs: DemoLessonSpec[], now: Date, tzOffsetMinutes: number): Lesson[] {
  return specs.map((spec) => {
    const [h, m] = spec.startTime.split(':').map(Number) as [number, number];
    // День берём по часам школы, а не по UTC (см. materializeDemoLessons).
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

const mockAttendance: Attendance[] = [
  {
    id: MOCK_IDS.attendance.chessPast1Dasha,
    lessonId: MOCK_IDS.lessons.chessPast1,
    studentId: DEMO_IDS.students.dasha,
    status: 'PRESENT',
    comment: null,
    markedById: MOCK_IDS.teachers.andrey,
    markedAt: T0,
  },
  {
    id: MOCK_IDS.attendance.chessPast2Dasha,
    lessonId: MOCK_IDS.lessons.chessPast2,
    studentId: DEMO_IDS.students.dasha,
    status: 'ABSENT',
    comment: null,
    markedById: MOCK_IDS.teachers.andrey,
    markedAt: T0,
  },
];

/** Всё, что state.ts добавляет к копиям фикстур; даты — относительно `now`. */
export function buildWorldExtras(now: Date) {
  const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
  const parentConversation: AiConversation = {
    id: MOCK_IDS.parentConversation,
    userId: DEMO_IDS.users.parent,
    studentId: DEMO_IDS.students.alexey,
    kind: 'TUTOR',
    title: 'Как Алексей занимается?',
    lastMessageAt: at(-1),
    createdAt: at(-1),
  };
  const parentMessages: AiMessage[] = [
    {
      id: MOCK_IDS.parentMessages.m1,
      conversationId: MOCK_IDS.parentConversation,
      role: 'USER',
      content: 'Как Алексей занимается в последнее время?',
      createdAt: at(-1),
    },
    {
      id: MOCK_IDS.parentMessages.m2,
      conversationId: MOCK_IDS.parentConversation,
      role: 'ASSISTANT',
      content:
        'Алексей не пропускает занятия по робототехнике и программированию. В робототехнике есть задания, решённые с ошибками, — могу перечислить их и подсказать, как помочь.',
      createdAt: at(-1),
    },
  ];
  const invites: MockInvite[] = [
    {
      token: MOCK_INVITE_TOKENS.pending,
      parentId: DEMO_IDS.parents.mariaAsParent,
      createdAt: at(-1),
      expiresAt: at(6),
      acceptedByStudentId: null,
      acceptedAt: null,
    },
    {
      token: MOCK_INVITE_TOKENS.expired,
      parentId: DEMO_IDS.parents.olga,
      createdAt: at(-10),
      expiresAt: at(-3),
      acceptedByStudentId: null,
      acceptedAt: null,
    },
  ];
  return {
    users: mockUsers,
    teachers: mockTeachers,
    clubs: mockClubs,
    groups: mockGroups,
    enrollments: mockEnrollments,
    scheduleRules: mockScheduleRules,
    // В моке «школа» живёт в поясе браузера: так «сегодня» совпадает с экраном в любом TZ (CI — UTC).
    lessons: materialize(chessLessonSpecs, now, -now.getTimezoneOffset()),
    attendance: mockAttendance,
    parentConversation,
    parentMessages,
    invites,
  };
}
