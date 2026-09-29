/**
 * Демо-мир: единый набор данных для seed (packages/db) и MSW-моков (apps/web).
 * Владелец — contracts. Учебных данных намеренно мало: 1 школа, 1 преподаватель (он же родитель)
 * с группами робототехники и Python, 2 ученика, 1 родитель, курс с 4 блоками, 3 задания, сдача,
 * посещаемость, спрос на кружки из онбординга, оплата с поступлением в кошелёк, уведомления всех
 * ролей. Каталог — все 8 кружков (`CLUB_CATEGORIES`): остальные 6 ведут ещё трое преподавателей
 * (`demoCatalogUsers`, в dev-вход не попадают), учеников в их группах нет.
 *
 * Даты занятий, посещаемости, сдач, оплаты и уведомлений задаются относительно «сейчас» — см.
 * materializeDemoLessons(), materializeDemoAttendance(), materializeDemoSubmissions(),
 * materializeDemoPayment(), materializeDemoPaidPeriod(), materializeDemoWalletIncome()
 * и materializeDemoRoleNotifications().
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
import type { ClubInterestStatus, Role } from '../enums';

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
  /** Преподаватели каталога (не в dev-входе): шахматы и предпринимательство, языки, ИЗО и ораторы. */
  catalogUsers: { andrey: demoId(0x200), elena: demoId(0x201), svetlana: demoId(0x202) },
  teachers: {
    maria: demoId(20),
    andrey: demoId(0x210),
    elena: demoId(0x211),
    svetlana: demoId(0x212),
  },
  students: { alexey: demoId(21), dasha: demoId(22) },
  parents: { olga: demoId(23), mariaAsParent: demoId(24) },
  clubs: {
    robotics: demoId(30),
    programming: demoId(31),
    chess: demoId(0x220),
    entrepreneurship: demoId(0x221),
    english: demoId(0x222),
    chinese: demoId(0x223),
    art: demoId(0x224),
    speaking: demoId(0x225),
  },
  groups: {
    roboticsA: demoId(40),
    programmingA: demoId(41),
    chessA: demoId(0x230),
    entrepreneurshipA: demoId(0x231),
    englishA: demoId(0x232),
    chineseA: demoId(0x233),
    artA: demoId(0x234),
    speakingA: demoId(0x235),
  },
  enrollments: {
    alexeyRobotics: demoId(50),
    dashaRobotics: demoId(51),
    alexeyProgramming: demoId(52),
  },
  scheduleRules: {
    roboticsMon: demoId(60),
    roboticsThu: demoId(61),
    programmingTue: demoId(62),
    chessMon: demoId(0x250),
    chessWed: demoId(0x251),
    entrepreneurshipSat: demoId(0x252),
    englishTue: demoId(0x253),
    chineseThu: demoId(0x254),
    artFri: demoId(0x255),
    speakingSat: demoId(0x256),
  },
  lessons: {
    roboticsPast1: demoId(70),
    roboticsPast2: demoId(71),
    roboticsToday: demoId(72),
    roboticsNext: demoId(73),
    programmingTomorrow: demoId(74),
    programmingPast: demoId(75),
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
    pyPastAlexey: demoId(124),
  },
  conversation: demoId(130),
  messages: { m1: demoId(131), m2: demoId(132) },
  payment: demoId(140),
  paidPeriod: demoId(141),
  /** Поступление в кошелёк Марии от демо-оплаты (INCOME). */
  walletIncome: demoId(142),
  notification: demoId(150),
  parentNotification: demoId(151),
  teacherNotification: demoId(152),
  clubInterests: { alexeyRobotics: demoId(160), alexeyProgramming: demoId(161) },
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

const catalogUser = (
  id: string,
  maxUserId: string,
  firstName: string,
  lastName: string,
): DemoUser => ({
  id,
  maxUserId,
  firstName,
  lastName,
  nickname: null,
  avatarUrl: null,
  locale: 'ru',
  theme: 'SYSTEM',
  createdAt: T0,
  roles: ['TEACHER'],
});

/** Преподаватели каталога: есть в seed и моках, но не в списке dev-входа (`demoLoginUsers`). */
export const demoCatalogUsers: DemoUser[] = [
  catalogUser(DEMO_IDS.catalogUsers.andrey, 'max-teacher-2', 'Андрей', 'Петров'),
  catalogUser(DEMO_IDS.catalogUsers.elena, 'max-teacher-3', 'Елена', 'Соколова'),
  catalogUser(DEMO_IDS.catalogUsers.svetlana, 'max-teacher-4', 'Светлана', 'Кузнецова'),
];

export const demoTeachers: TeacherProfile[] = [
  {
    id: DEMO_IDS.teachers.maria,
    userId: DEMO_IDS.users.teacher,
    schoolId: DEMO_IDS.school,
    qualification: 'Педагог дополнительного образования, робототехника и программирование',
    bio: 'Веду кружки робототехники и Python с 2019 года.',
    photoUrl: null,
    contactsVisible: true,
    subjects: ['ROBOTICS', 'PROGRAMMING'],
  },
  {
    id: DEMO_IDS.teachers.andrey,
    userId: DEMO_IDS.catalogUsers.andrey,
    schoolId: DEMO_IDS.school,
    qualification: 'Кандидат в мастера спорта по шахматам, наставник школьных бизнес-проектов',
    bio: 'Учу видеть комбинации — на доске и в собственном деле.',
    photoUrl: null,
    contactsVisible: false,
    subjects: ['CHESS', 'ENTREPRENEURSHIP'],
  },
  {
    id: DEMO_IDS.teachers.elena,
    userId: DEMO_IDS.catalogUsers.elena,
    schoolId: DEMO_IDS.school,
    qualification: 'Преподаватель английского и китайского языков, CELTA, HSK 5',
    bio: 'Разговорный язык через игры и проекты.',
    photoUrl: null,
    contactsVisible: false,
    subjects: ['ENGLISH', 'CHINESE'],
  },
  {
    id: DEMO_IDS.teachers.svetlana,
    userId: DEMO_IDS.catalogUsers.svetlana,
    schoolId: DEMO_IDS.school,
    qualification: 'Художник-педагог, тренер по публичным выступлениям',
    bio: 'Помогаю детям найти свой голос — на холсте и на сцене.',
    photoUrl: null,
    contactsVisible: false,
    subjects: ['ART', 'PUBLIC_SPEAKING'],
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

function catalogClub(
  id: string,
  category: Club['category'],
  title: string,
  description: string,
  amountKopecks: number,
  tags: string[],
): Club {
  return {
    id,
    schoolId: DEMO_IDS.school,
    title,
    description,
    category,
    coverUrl: null,
    price: { amountKopecks, currency: 'RUB' },
    billingPeriod: 'MONTH',
    isActive: true,
    tags,
  };
}

/** Все 8 кружков каталога: робототехника и Python — у Марии, остальные — у преподавателей каталога. */
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
  catalogClub(
    DEMO_IDS.clubs.chess,
    'CHESS',
    'Шахматы',
    'Тактика, дебюты и турнирная практика: учимся думать на несколько ходов вперёд.',
    250_000,
    ['тактика', 'турниры', 'логика'],
  ),
  catalogClub(
    DEMO_IDS.clubs.entrepreneurship,
    'ENTREPRENEURSHIP',
    'Юный предприниматель',
    'От идеи до запуска: план, расчёты, команда и защита собственного проекта.',
    300_000,
    ['проекты', 'бизнес-план', 'команда'],
  ),
  catalogClub(
    DEMO_IDS.clubs.english,
    'ENGLISH',
    'Английский язык',
    'Разговорный английский в игровой форме, небольшие группы.',
    320_000,
    ['разговорный', 'игры', 'A1–B1'],
  ),
  catalogClub(
    DEMO_IDS.clubs.chinese,
    'CHINESE',
    'Китайский язык',
    'Иероглифы, тоны и первые диалоги — с нуля, в игровой форме.',
    340_000,
    ['иероглифы', 'HSK 1', 'разговорный'],
  ),
  catalogClub(
    DEMO_IDS.clubs.art,
    'ART',
    'Рисование и живопись',
    'Акварель, гуашь и графика: от набросков до собственной выставки.',
    260_000,
    ['акварель', 'гуашь', 'композиция'],
  ),
  catalogClub(
    DEMO_IDS.clubs.speaking,
    'PUBLIC_SPEAKING',
    'Ораторское мастерство',
    'Выступаем без страха: голос, аргументы, дебаты и презентации.',
    280_000,
    ['выступления', 'дебаты', 'уверенность'],
  ),
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
  ...(
    [
      ['chessA', 'chess', 'andrey', 'Шахматы, группа А'],
      ['entrepreneurshipA', 'entrepreneurship', 'andrey', 'Юный предприниматель, группа А'],
      ['englishA', 'english', 'elena', 'Английский, группа А'],
      ['chineseA', 'chinese', 'elena', 'Китайский, группа А'],
      ['artA', 'art', 'svetlana', 'Рисование, группа А'],
      ['speakingA', 'speaking', 'svetlana', 'Ораторское мастерство, группа А'],
    ] as const
  ).map(([group, club, teacher, title]): Group => ({
    id: DEMO_IDS.groups[group],
    clubId: DEMO_IDS.clubs[club],
    teacherId: DEMO_IDS.teachers[teacher],
    title,
    isActive: true,
  })),
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
  ...(
    [
      ['chessMon', 'chessA', 1, '19:00', '20:30', 'Каб. 7'],
      ['chessWed', 'chessA', 3, '19:00', '20:30', 'Каб. 7'],
      ['entrepreneurshipSat', 'entrepreneurshipA', 6, '11:00', '12:30', 'Каб. 3'],
      ['englishTue', 'englishA', 2, '17:30', '18:30', 'Каб. 9'],
      ['chineseThu', 'chineseA', 4, '17:00', '18:00', 'Каб. 9'],
      ['artFri', 'artA', 5, '16:00', '17:30', 'Изостудия'],
      ['speakingSat', 'speakingA', 6, '13:00', '14:00', 'Актовый зал'],
    ] as const
  ).map(([rule, group, weekday, startTime, endTime, room]): ScheduleRule => ({
    id: DEMO_IDS.scheduleRules[rule],
    groupId: DEMO_IDS.groups[group],
    weekday,
    startTime,
    endTime,
    room,
    validFrom: '2026-09-01',
    validTo: null,
  })),
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
    // Дата плавает относительно «сейчас» — занятие разовое; если оно легло на слот правила,
    // материализация этот слот пропускает, а seed удаляет занятие из правила (docs/05 §5.5).
    ruleId: null,
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
    ruleId: null,
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
  {
    // Вчерашнее занятие Python с отметкой: у кружка есть посещаемость, у Алексея — живая серия.
    id: DEMO_IDS.lessons.programmingPast,
    groupId: DEMO_IDS.groups.programmingA,
    ruleId: null,
    dayOffset: -1,
    startTime: '16:00',
    durationMin: 60,
    topic: 'Переменные и ввод',
    room: 'Каб. 5',
    status: 'DONE',
  },
];

const MINUTE_MS = 60_000;

/**
 * Момент `HH:mm` по часам школы в день `dayOffset` от сегодняшнего (тоже по часам школы).
 * День берём по часам школы, а не по UTC: иначе с 00:00 до 03:00 МСК «сегодня» уезжает на вчера.
 */
function atSchoolTime(now: Date, tzOffsetMinutes: number, dayOffset: number, time: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const local = new Date(now.getTime() + tzOffsetMinutes * MINUTE_MS);
  const base = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + dayOffset,
  );
  return new Date(base + (h * 60 + m - tzOffsetMinutes) * MINUTE_MS);
}

/** Дата `YYYY-MM-DD` по часам школы. */
function schoolDate(at: Date, tzOffsetMinutes: number): string {
  return new Date(at.getTime() + tzOffsetMinutes * MINUTE_MS).toISOString().slice(0, 10);
}

/**
 * Превращает спецификации занятий в Lesson с абсолютными датами.
 * @param now — точка отсчёта; @param tzOffsetMinutes — смещение часового пояса школы от UTC (Москва: 180)
 */
export function materializeLessons(
  specs: readonly DemoLessonSpec[],
  now: Date = new Date(),
  tzOffsetMinutes = 180,
): Lesson[] {
  return specs.map((spec) => {
    const startsAt = atSchoolTime(now, tzOffsetMinutes, spec.dayOffset, spec.startTime);
    const endsAt = new Date(startsAt.getTime() + spec.durationMin * MINUTE_MS);
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

/** Занятия демо-мира (`demoLessonSpecs`) с абсолютными датами — см. `materializeLessons`. */
export function materializeDemoLessons(now: Date = new Date(), tzOffsetMinutes = 180): Lesson[] {
  return materializeLessons(demoLessonSpecs, now, tzOffsetMinutes);
}

/**
 * Отметки посещаемости прошедших занятий. `markedAt` здесь — заглушка (занятия плавают
 * относительно «сейчас»); настоящее время отметки — начало занятия, см. `materializeDemoAttendance`.
 */
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
  {
    id: DEMO_IDS.attendance.pyPastAlexey,
    lessonId: DEMO_IDS.lessons.programmingPast,
    studentId: DEMO_IDS.students.alexey,
    status: 'PRESENT',
    comment: null,
    markedById: DEMO_IDS.teachers.maria,
    markedAt: T0,
  },
];

/** Посещаемость демо-мира: отметка поставлена в начале занятия (не раньше самого занятия). */
export function materializeDemoAttendance(
  now: Date = new Date(),
  tzOffsetMinutes = 180,
): Attendance[] {
  const startsAt = new Map(
    materializeDemoLessons(now, tzOffsetMinutes).map((lesson) => [lesson.id, lesson.startsAt]),
  );
  return demoAttendance.map((row) => ({
    ...row,
    markedAt: startsAt.get(row.lessonId) ?? row.markedAt,
  }));
}

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
    studentIds: [],
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
    studentIds: [],
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
    studentIds: [],
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
  // Срок прошёл, сдача — до срока: задание видно в выполненных и в успеваемости групп.
  [DEMO_IDS.assignments.simpleHomework]: -2,
};

/**
 * Сдачи демо-мира. `submittedAt`/`gradedAt` здесь — заглушки; настоящие даты — относительно
 * «сейчас», см. `materializeDemoSubmissions`.
 */
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

/** Когда сдана и проверена каждая демо-сдача: дни от сегодняшнего и время по часам школы. */
const demoSubmissionTimes: Record<
  string,
  { submitted: [number, string]; graded: [number, string] }
> = {
  // До срока (−2 дня): задача сдана 3 дня назад вечером, проверена на следующее утро.
  [DEMO_IDS.submissions.alexeySimpleHomework]: { submitted: [-3, '18:00'], graded: [-2, '10:00'] },
};

/** Сдачи демо-мира с датами относительно `now` (как занятия): не старятся от деплоя к деплою. */
export function materializeDemoSubmissions(
  now: Date = new Date(),
  tzOffsetMinutes = 180,
): Submission[] {
  return demoSubmissions.map((submission) => {
    const times = demoSubmissionTimes[submission.id];
    if (!times) return submission;
    const at = ([dayOffset, time]: [number, string]) =>
      atSchoolTime(now, tzOffsetMinutes, dayOffset, time).toISOString();
    return {
      ...submission,
      submittedAt: at(times.submitted),
      gradedAt: submission.gradedAt ? at(times.graded) : null,
    };
  });
}

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

/** Демо-оплата Ольги за робототехнику Алексея: столько дней назад по часам школы, в 10:00. */
const DEMO_PAYMENT_DAY_OFFSET = -22;
/** Оплаченный период — 30 дней с дня оплаты (как у fake-провайдера). */
const DEMO_PAID_PERIOD_DAYS = 30;

/** Демо-оплата с датой относительно `now` (как занятия демо-мира). */
export function materializeDemoPayment(now: Date = new Date(), tzOffsetMinutes = 180): Payment {
  const paidAt = atSchoolTime(now, tzOffsetMinutes, DEMO_PAYMENT_DAY_OFFSET, '10:00').toISOString();
  return {
    id: DEMO_IDS.payment,
    parentId: DEMO_IDS.parents.olga,
    studentId: DEMO_IDS.students.alexey,
    enrollmentId: DEMO_IDS.enrollments.alexeyRobotics,
    amount: { amountKopecks: 350000, currency: 'RUB' },
    status: 'SUCCEEDED',
    provider: 'fake',
    periodsCount: 1,
    confirmationUrl: null,
    createdAt: paidAt,
    paidAt,
    failReason: null,
  };
}

/** Период, оплаченный демо-оплатой: 30 дней начиная с дня оплаты (даты — по часам школы). */
export function materializeDemoPaidPeriod(
  now: Date = new Date(),
  tzOffsetMinutes = 180,
): PaidPeriod {
  const start = atSchoolTime(now, tzOffsetMinutes, DEMO_PAYMENT_DAY_OFFSET, '00:00');
  const end = atSchoolTime(
    now,
    tzOffsetMinutes,
    DEMO_PAYMENT_DAY_OFFSET + DEMO_PAID_PERIOD_DAYS - 1,
    '00:00',
  );
  return {
    id: DEMO_IDS.paidPeriod,
    enrollmentId: DEMO_IDS.enrollments.alexeyRobotics,
    periodStart: schoolDate(start, tzOffsetMinutes),
    periodEnd: schoolDate(end, tzOffsetMinutes),
    paymentId: DEMO_IDS.payment,
  };
}

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

/** Поступление в кошелёк преподавателя от демо-оплаты (`TeacherWalletTransaction`, INCOME). */
export interface DemoWalletIncome {
  id: string;
  teacherId: string;
  kind: 'INCOME';
  amount: Payment['amount'];
  groupId: string;
  studentId: string;
  paymentId: string;
  at: string;
}

/**
 * Каждая оплата закрывается поступлением преподавателю группы (docs/07 F17): у демо-оплаты
 * Ольги — INCOME Марии на ту же сумму в момент оплаты. Иначе кошелёк Марии пуст, хотя
 * родитель видит оплату.
 */
export function materializeDemoWalletIncome(
  now: Date = new Date(),
  tzOffsetMinutes = 180,
): DemoWalletIncome {
  const payment = materializeDemoPayment(now, tzOffsetMinutes);
  return {
    id: DEMO_IDS.walletIncome,
    teacherId: DEMO_IDS.teachers.maria,
    kind: 'INCOME',
    amount: payment.amount,
    groupId: DEMO_IDS.groups.roboticsA,
    studentId: payment.studentId,
    paymentId: payment.id,
    at: payment.paidAt ?? payment.createdAt,
  };
}

/** Уведомление с адресатом (User.id). */
export type DemoNotification = Notification & { userId: string };

/**
 * Уведомления родителя и преподавателя (у ученика — `demoNotification`): Ольге — об оплате,
 * Марии — о сдаче Алексея. Время — момент самого события (оплаты, сдачи) относительно `now`.
 */
export function materializeDemoRoleNotifications(
  now: Date = new Date(),
  tzOffsetMinutes = 180,
): DemoNotification[] {
  const payment = materializeDemoPayment(now, tzOffsetMinutes);
  const submission = materializeDemoSubmissions(now, tzOffsetMinutes).find(
    (row) => row.id === DEMO_IDS.submissions.alexeySimpleHomework,
  );
  const homework = DEMO_IDS.assignments.simpleHomework;
  return [
    {
      id: DEMO_IDS.parentNotification,
      userId: DEMO_IDS.users.parent,
      type: 'PAYMENT_SUCCEEDED',
      title: 'Оплата прошла',
      body: 'Робототехника, Алексей — 3 500 ₽ за месяц',
      payload: { entityType: 'payment', entityId: payment.id, route: '/parent/payments' },
      readAt: null,
      createdAt: payment.paidAt ?? payment.createdAt,
    },
    {
      id: DEMO_IDS.teacherNotification,
      userId: DEMO_IDS.users.teacher,
      type: 'SUBMISSION_RECEIVED',
      title: 'Новая сдача',
      body: '«Задачи 1–10, стр. 52»',
      payload: { entityType: 'assignment', entityId: homework, route: '/teacher/assignments' },
      readAt: null,
      createdAt: submission?.submittedAt ?? payment.createdAt,
    },
  ];
}

/** Спрос на кружки из онбординга (`StudentClubInterest`). */
export interface DemoClubInterest {
  id: string;
  studentId: string;
  clubId: string;
  status: ClubInterestStatus;
  /** Оценка ИИ 0..1. */
  score: number | null;
  reason: string | null;
}

/**
 * Онбординг Алексея пройден — значит, выбор кружков записан, как его пишет завершение
 * онбординга: он записался в оба кружка. На этом строится «Спрос на кружки» преподавателя.
 */
export const demoClubInterests: DemoClubInterest[] = [
  {
    id: DEMO_IDS.clubInterests.alexeyRobotics,
    studentId: DEMO_IDS.students.alexey,
    clubId: DEMO_IDS.clubs.robotics,
    status: 'CHOSEN',
    score: 0.92,
    reason: 'Любит собирать роботов и решать практические задачи',
  },
  {
    id: DEMO_IDS.clubInterests.alexeyProgramming,
    studentId: DEMO_IDS.students.alexey,
    clubId: DEMO_IDS.clubs.programming,
    status: 'CHOSEN',
    score: 0.85,
    reason: 'Хочет научиться программировать и делать свои игры',
  },
];

/** Все пользователи для dev-входа: кого можно выбрать на экране «Войти как». */
export const demoLoginUsers = Object.values(demoUsers).map((u) => ({
  id: u.id,
  maxUserId: u.maxUserId,
  name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
  roles: u.roles,
}));
