/**
 * Дополнения демо-мира только для MSW (не фикстуры и не seed): «Шахматы» у Даши — как в макете
 * главной родителя (сами кружки каталога и их преподаватели — в фикстурах), кошельки родителей,
 * приглашения по ссылке и диалог родителя с тьютором; для режима репетитора — короткие номера
 * групп, второе занятие Марии сегодня, отметки её уже начавшихся сегодняшних занятий, её кошелёк
 * с историей и оплаты за недавние поступления. Собирается в `state.ts` при каждом сбросе.
 */
import type {
  AiConversation,
  AiMessage,
  Attendance,
  Enrollment,
  Lesson,
  PaidPeriod,
  Payment,
  TeacherWalletTransactionKind,
} from '@edu/contracts';
import {
  DEMO_IDS,
  type DemoLessonSpec,
  demoCatalogUsers,
  demoClubs,
  demoEnrollments,
  demoGroups,
  demoId,
  materializeDemoLessons,
  materializeLessons,
} from '@edu/contracts/fixtures';
import { addDays, toDateOnly } from '@/shared/lib/dates';
import { roll } from './seed';

const DAY_MS = 86_400_000;
const T0 = '2026-09-01T00:00:00.000Z';

/**
 * Id сущностей мок-мира. Кружки каталога, их группы и преподаватели — из фикстур (`DEMO_IDS`),
 * здесь только ссылки на них; своё у моков — в диапазоне 0x240+ (не пересекается с фикстурами).
 */
export const MOCK_IDS = {
  users: {
    chessTeacher: DEMO_IDS.catalogUsers.andrey,
    englishTeacher: DEMO_IDS.catalogUsers.elena,
  },
  teachers: { andrey: DEMO_IDS.teachers.andrey, elena: DEMO_IDS.teachers.elena },
  clubs: {
    chess: DEMO_IDS.clubs.chess,
    entrepreneurship: DEMO_IDS.clubs.entrepreneurship,
    english: DEMO_IDS.clubs.english,
  },
  groups: {
    chessA: DEMO_IDS.groups.chessA,
    entrepreneurshipA: DEMO_IDS.groups.entrepreneurshipA,
    englishA: DEMO_IDS.groups.englishA,
  },
  enrollments: { dashaChess: demoId(0x240) },
  lessons: {
    chessPast1: demoId(0x260),
    chessPast2: demoId(0x261),
    chessToday: demoId(0x262),
    chessNext1: demoId(0x263),
    chessNext2: demoId(0x264),
    programmingToday: demoId(0x265),
  },
  attendance: {
    chessPast1Dasha: demoId(0x270),
    chessPast2Dasha: demoId(0x271),
    programmingTodayAlexey: demoId(0x272),
    roboticsTodayAlexey: demoId(0x273),
    roboticsTodayDasha: demoId(0x274),
  },
  parentConversation: demoId(0x280),
  parentMessages: { m1: demoId(0x281), m2: demoId(0x282) },
  /** Оплаты зачислений, от которых недавно пришли поступления Марии (см. `buildTutorPayments`). */
  payments: { dashaRobotics: demoId(0x290), alexeyProgramming: demoId(0x291) },
  paidPeriods: { dashaRobotics: demoId(0x292), alexeyProgramming: demoId(0x293) },
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

/**
 * Короткие номера групп («001») для таблиц и подписей графиков режима репетитора. В модели данных
 * поля пока нет (docs/04, планируется) — живёт только в моках, отдаётся в `GroupBrief.code`.
 */
export const MOCK_GROUP_CODES: Readonly<Record<string, string>> = {
  [DEMO_IDS.groups.roboticsA]: '001',
  [DEMO_IDS.groups.programmingA]: '012',
  [MOCK_IDS.groups.chessA]: '003',
  [MOCK_IDS.groups.entrepreneurshipA]: '007',
  [MOCK_IDS.groups.englishA]: '005',
};

/** Баланс кошелька Марии-преподавателя сейчас, в копейках: 6 700 ₽ — как в макете. */
export const DEMO_TEACHER_WALLET_KOPECKS = 670_000;
/** Вчерашний вывод Марии в 19:00, в копейках: 12 388 ₽ — как в макете. */
export const DEMO_TEACHER_WITHDRAWAL_KOPECKS = 1_238_800;

/** Операция кошелька преподавателя (модели в БД пока нет — docs/04, до PaymentProvider). */
export interface MockTeacherTransaction {
  id: string;
  kind: TeacherWalletTransactionKind;
  /** Всегда больше нуля; направление задаёт `kind`. */
  amountKopecks: number;
  at: string;
  /** За какую группу и ученика поступление; у вывода — null. */
  groupId: string | null;
  studentId: string | null;
}

/** Кошелёк преподавателя: баланс = `openingKopecks` + поступления − выводы. */
export interface MockTeacherWallet {
  /** Баланс до первой операции истории. */
  openingKopecks: number;
  /** Операции в порядке добавления (не обязательно по времени). */
  transactions: MockTeacherTransaction[];
}

/** Приглашение ребёнка по ссылке (модель ParentInvite из docs/04 — пока только в моках). */
export interface MockInvite {
  token: string;
  parentId: string;
  createdAt: string;
  expiresAt: string;
  acceptedByStudentId: string | null;
  acceptedAt: string | null;
}

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

/**
 * Второе занятие Марии сегодня (Python в 12:00) — главная репетитора, как в макете, показывает
 * расписание дня из нескольких строк. Группа Python — только у Алексея.
 */
const tutorLessonSpecs: DemoLessonSpec[] = [
  {
    id: MOCK_IDS.lessons.programmingToday,
    groupId: DEMO_IDS.groups.programmingA,
    ruleId: null,
    dayOffset: 0,
    startTime: '12:00',
    durationMin: 90,
    topic: 'Списки и словари',
    room: 'Каб. 5',
    status: 'PLANNED',
  },
];

/** Отметки прошедших занятий шахмат; `markedAt` — заглушка, в мире это начало занятия. */
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

/**
 * Отметки уже начавшихся сегодняшних занятий Марии (Python в 12:00, робототехника в 15:00):
 * «Общая успеваемость» считает только отмеченные занятия (docs/04 §4.6), и без них период по
 * умолчанию «1 день» после обеда пуст. Даша — по уважительной причине: в столбце есть
 * «пропустили», а пропусков без причины у родителя не прибавляется.
 */
function tutorTodayAttendance(lessons: Lesson[], now: Date): Attendance[] {
  const marks = [
    {
      id: MOCK_IDS.attendance.programmingTodayAlexey,
      lessonId: MOCK_IDS.lessons.programmingToday,
      studentId: DEMO_IDS.students.alexey,
      status: 'PRESENT' as const,
      comment: null,
    },
    {
      id: MOCK_IDS.attendance.roboticsTodayAlexey,
      lessonId: DEMO_IDS.lessons.roboticsToday,
      studentId: DEMO_IDS.students.alexey,
      status: 'PRESENT' as const,
      comment: null,
    },
    {
      id: MOCK_IDS.attendance.roboticsTodayDasha,
      lessonId: DEMO_IDS.lessons.roboticsToday,
      studentId: DEMO_IDS.students.dasha,
      status: 'EXCUSED' as const,
      comment: 'Предупредила заранее',
    },
  ];
  return marks.flatMap((mark): Attendance[] => {
    const lesson = lessons.find((l) => l.id === mark.lessonId);
    // Ещё не началось — отмечать рано.
    if (!lesson || new Date(lesson.startsAt) > now) return [];
    return [{ ...mark, markedById: DEMO_IDS.teachers.maria, markedAt: lesson.startsAt }];
  });
}

// ---------- Кошелёк Марии-преподавателя ----------

const RUB = 100;
/** Сколько дней истории поступлений генерировать. */
const WALLET_HISTORY_DAYS = 35;
/** Время поступлений в сгенерированные дни; сумма — цена кружка (docs/04: равна оплате). */
const INCOME_TIMES = ['10:00', '17:00', '17:28'] as const;
/** Оплаченный период (как у fake-провайдера родителя): 30 дней. */
const PAID_PERIOD_DAYS = 30;
/** Время выводов. */
const WITHDRAWAL_TIME = '19:00';
/** Минимальный вывод — как в контракте (`TEACHER_WITHDRAW_MIN_KOPECKS`). */
const WITHDRAWAL_MIN_KOPECKS = 100 * RUB;
/**
 * Еженедельные выводы в прошлом (дни от «сегодня», от поздних к ранним) и сколько рублей Мария
 * оставляла на счёте после каждого; суммы выводов подбираются под эти остатки. Остаток после
 * самого позднего получается сам — от него история сходится к балансу из макета.
 */
const PAST_WITHDRAWALS: ReadonlyArray<{ dayOffset: number; leftRub: number | null }> = [
  { dayOffset: -4, leftRub: null },
  { dayOffset: -11, leftRub: 1500 },
  { dayOffset: -18, leftRub: 600 },
  { dayOffset: -25, leftRub: 1200 },
  { dayOffset: -32, leftRub: 900 },
];
/** Баланс в начале истории, ₽. */
const OPENING_RUB = 800;

/** Последние дни — вручную, как в макете: блоки «вчера» и «сегодня» в транзакциях. */
const RECENT_INCOMES = [
  { dayOffset: -3, time: '17:28', enrollmentId: DEMO_IDS.enrollments.alexeyProgramming },
  { dayOffset: -1, time: '10:00', enrollmentId: DEMO_IDS.enrollments.alexeyRobotics },
  { dayOffset: -1, time: '17:00', enrollmentId: DEMO_IDS.enrollments.dashaRobotics },
  { dayOffset: 0, time: '10:00', enrollmentId: DEMO_IDS.enrollments.dashaRobotics },
  { dayOffset: 0, time: '17:28', enrollmentId: DEMO_IDS.enrollments.alexeyProgramming },
] as const;
/** Дни, заданные вручную, генератор пропускает. */
const RECENT_FROM_DAY = -3;

/** Время `HH:MM` дня `dayOffset` от сегодняшнего — в поясе браузера, как у занятий. */
function atLocal(now: Date, dayOffset: number, time: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(h, m, 0, 0);
  return date;
}

/** Активные зачисления в группы Марии — от них приходят поступления. */
function mariaSources(): Enrollment[] {
  const groupIds = new Set(
    demoGroups.filter((g) => g.teacherId === DEMO_IDS.teachers.maria).map((g) => g.id),
  );
  return demoEnrollments.filter((e) => e.status === 'ACTIVE' && groupIds.has(e.groupId));
}

/** Цена периода кружка группы зачисления, в копейках. */
function priceOf(enrollment: Enrollment): number {
  const group = demoGroups.find((g) => g.id === enrollment.groupId)!;
  return demoClubs.find((c) => c.id === group.clubId)!.price.amountKopecks;
}

/**
 * Кошелёк Марии: детерминированные поступления от учеников её групп за ~35 дней (0–2 в день,
 * сумма — цена кружка, в 10:00 / 17:00 / 17:28; не раньше зачисления ученика), еженедельные
 * выводы, вчера в 19:00 — вывод 12 388 ₽, сегодня — два поступления (ещё не наступившие по
 * времени переносятся на вчера). Суммы прошлых выводов считаются от конца: баланс сейчас —
 * ровно 6 700 ₽ и нигде не уходит в минус.
 */
function buildMariaWallet(now: Date): MockTeacherWallet {
  const teacherId = DEMO_IDS.teachers.maria;
  const sources = mariaSources();
  const enrollment = (id: string) => sources.find((e) => e.id === id)!;
  /** Зачисления, которые уже были к моменту `at`: до зачисления ученик не платит. */
  const enrolledBy = (at: Date) => sources.filter((e) => new Date(e.enrolledAt) <= at);
  let nextIncomeId = 0x400;
  const income = (at: Date, source: Enrollment): MockTeacherTransaction => ({
    id: demoId(nextIncomeId++),
    kind: 'INCOME',
    amountKopecks: priceOf(source),
    at: at.toISOString(),
    groupId: source.groupId,
    studentId: source.studentId,
  });

  const incomes: MockTeacherTransaction[] = [];
  for (let day = -WALLET_HISTORY_DAYS; day < RECENT_FROM_DAY; day += 1) {
    const seed = `wallet:${teacherId}:${day}`;
    const r = roll(seed, 'count', 100);
    const count = r < 40 ? 0 : r < 85 ? 1 : 2;
    const first = roll(seed, 'time', INCOME_TIMES.length);
    const times = [first, (first + 1 + roll(seed, 'time2', 2)) % INCOME_TIMES.length]
      .slice(0, count)
      .sort((a, b) => a - b);
    times.forEach((timeIndex, i) => {
      const at = atLocal(now, day, INCOME_TIMES[timeIndex]!);
      const payers = enrolledBy(at);
      // В дни до первого зачисления поступлений нет.
      if (payers.length === 0) return;
      incomes.push(income(at, payers[roll(seed, `source${i}`, payers.length)]!));
    });
  }
  for (const item of RECENT_INCOMES) {
    let at = atLocal(now, item.dayOffset, item.time);
    // «Сегодня» только то, что уже наступило; утром сегодняшние поступления — вчерашние.
    if (at.getTime() > now.getTime()) at = atLocal(now, item.dayOffset - 1, item.time);
    const source = enrollment(item.enrollmentId);
    if (new Date(source.enrolledAt) <= at) incomes.push(income(at, source));
  }

  let nextWithdrawalId = 0x480;
  const withdrawal = (at: Date, amountKopecks: number): MockTeacherTransaction => ({
    id: demoId(nextWithdrawalId++),
    kind: 'WITHDRAWAL',
    amountKopecks,
    at: at.toISOString(),
    groupId: null,
    studentId: null,
  });
  const withdrawals = [
    withdrawal(atLocal(now, -1, WITHDRAWAL_TIME), DEMO_TEACHER_WITHDRAWAL_KOPECKS),
  ];

  // Идём от «сейчас» назад: баланс до операции = баланс после − её знак. Сумма прошлого вывода —
  // чтобы после предыдущего (более раннего) на счёте оставалось его `leftRub`, а в начале истории —
  // `OPENING_RUB`; так баланс нигде не уходит в минус.
  const time = (tx: MockTeacherTransaction) => new Date(tx.at).getTime();
  const signed = (tx: MockTeacherTransaction) =>
    tx.kind === 'INCOME' ? tx.amountKopecks : -tx.amountKopecks;
  const events = [...incomes, ...withdrawals].sort((a, b) => time(b) - time(a));
  const points = PAST_WITHDRAWALS.map((p) => ({
    at: atLocal(now, p.dayOffset, WITHDRAWAL_TIME).getTime(),
    leftKopecks: (p.leftRub ?? 0) * RUB,
  })).sort((a, b) => b.at - a.at);
  let balance = DEMO_TEACHER_WALLET_KOPECKS;
  let cursor = 0;
  points.forEach((point, index) => {
    for (; cursor < events.length && time(events[cursor]!) > point.at; cursor += 1) {
      balance -= signed(events[cursor]!);
    }
    const earlier = points[index + 1];
    const since = earlier?.at ?? Number.NEGATIVE_INFINITY;
    const earned = incomes
      .filter((tx) => time(tx) > since && time(tx) < point.at)
      .reduce((sum, tx) => sum + tx.amountKopecks, 0);
    const left = earlier ? earlier.leftKopecks : OPENING_RUB * RUB;
    let amount = Math.max(0, earned + left - balance);
    if (amount > 0) amount = Math.max(amount, WITHDRAWAL_MIN_KOPECKS);
    if (amount > 0) {
      withdrawals.push(withdrawal(new Date(point.at), amount));
      balance += amount;
    }
  });
  for (; cursor < events.length; cursor += 1) balance -= signed(events[cursor]!);

  return { openingKopecks: balance, transactions: [...incomes, ...withdrawals] };
}

/** Кошельки преподавателей: teacherId → операции. У остальных преподавателей — пустой (лениво). */
export function buildTeacherWallets(now: Date): Map<string, MockTeacherWallet> {
  return new Map([[DEMO_IDS.teachers.maria, buildMariaWallet(now)]]);
}

/** Id оплаты и её периода для зачислений Марии без оплаченных периодов в фикстурах. */
const TUTOR_PAYMENT_IDS: Readonly<Record<string, { payment: string; paidPeriod: string }>> = {
  [DEMO_IDS.enrollments.dashaRobotics]: {
    payment: MOCK_IDS.payments.dashaRobotics,
    paidPeriod: MOCK_IDS.paidPeriods.dashaRobotics,
  },
  [DEMO_IDS.enrollments.alexeyProgramming]: {
    payment: MOCK_IDS.payments.alexeyProgramming,
    paidPeriod: MOCK_IDS.paidPeriods.alexeyProgramming,
  },
};

/**
 * Оплаты за последние поступления Марии, чтобы «Вам должны» и платежи родителя не спорили с
 * кошельком: зачисление, от которого недавно пришли деньги, оплачено на 30 дней с дня последнего
 * поступления (следующий платёж — примерно через месяц, а не просрочка с дня зачисления). Платит
 * Ольга — родитель обоих учеников. Зачисление, оплаченное в фикстурах (робототехника Алексея,
 * 30 дней с оплаты, см. materializeDemoPaidPeriod), не трогаем. Каждое поступление с платежом один к одному мок не связывает (docs/04).
 */
export function buildTutorPayments(wallet: MockTeacherWallet): {
  payments: Payment[];
  paidPeriods: PaidPeriod[];
} {
  const payments: Payment[] = [];
  const paidPeriods: PaidPeriod[] = [];
  for (const source of mariaSources()) {
    const ids = TUTOR_PAYMENT_IDS[source.id];
    // Робототехника Алексея оплачена в фикстурах (materializeDemoPaidPeriod).
    if (!ids || source.id === DEMO_IDS.enrollments.alexeyRobotics) continue;
    const last = wallet.transactions
      .filter(
        (tx) =>
          tx.kind === 'INCOME' &&
          tx.groupId === source.groupId &&
          tx.studentId === source.studentId,
      )
      .map((tx) => tx.at)
      .sort()
      .at(-1);
    if (!last) continue;
    payments.push({
      id: ids.payment,
      parentId: DEMO_IDS.parents.olga,
      studentId: source.studentId,
      enrollmentId: source.id,
      amount: { amountKopecks: priceOf(source), currency: 'RUB' },
      status: 'SUCCEEDED',
      provider: 'fake',
      periodsCount: 1,
      confirmationUrl: null,
      createdAt: last,
      paidAt: last,
      failReason: null,
    });
    paidPeriods.push({
      id: ids.paidPeriod,
      enrollmentId: source.id,
      periodStart: toDateOnly(last),
      periodEnd: toDateOnly(addDays(last, PAID_PERIOD_DAYS - 1)),
      paymentId: ids.payment,
    });
  }
  return { payments, paidPeriods };
}

/** Всё, что state.ts добавляет к копиям фикстур; даты — относительно `now`. */
export function buildWorldExtras(now: Date) {
  const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
  const teacherWallets = buildTeacherWallets(now);
  // В моке «школа» живёт в поясе браузера: так «сегодня» совпадает с экраном в любом TZ (CI — UTC).
  const tzOffset = -now.getTimezoneOffset();
  const lessons = materializeLessons([...chessLessonSpecs, ...tutorLessonSpecs], now, tzOffset);
  const startsAt = new Map(lessons.map((lesson) => [lesson.id, lesson.startsAt]));
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
    // Преподаватели каталога — не в dev-входе, поэтому их пользователей добавляет мок-мир.
    users: demoCatalogUsers,
    enrollments: mockEnrollments,
    lessons,
    attendance: [
      // Отметка — в начале занятия, не раньше него.
      ...mockAttendance.map((row) => ({
        ...row,
        markedAt: startsAt.get(row.lessonId) ?? row.markedAt,
      })),
      ...tutorTodayAttendance([...lessons, ...materializeDemoLessons(now, tzOffset)], now),
    ],
    parentConversation,
    parentMessages,
    invites,
    teacherWallets,
    ...buildTutorPayments(teacherWallets.get(DEMO_IDS.teachers.maria)!),
  };
}
