/**
 * Дашборды ученика, родителя и преподавателя. Владелец — B6 (модуль analytics).
 * docs/05-api-contracts.md §5.3 `dashboards.ts`; формулы — docs/04 §4.6.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  DateOnlySchema,
  DateTimeSchema,
  IdSchema,
  PercentSchema,
  PeriodQuerySchema,
  RateSchema,
} from '../common';
import { AttendanceStatusSchema } from '../enums';
import {
  AiTextSchema,
  AssignmentBriefSchema,
  ClubBriefSchema,
  ClubProgressSchema,
  GroupBriefSchema,
  LessonDtoSchema,
  NotificationSchema,
  ScheduleRuleDtoSchema,
  SchoolBriefSchema,
  StatsBriefSchema,
  StudentBriefSchema,
  UserBriefSchema,
  WeeklyPointSchema,
} from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- Общие элементы ----------

/** Запись истории посещаемости. */
export const AttendanceHistoryItemSchema = z.object({
  lesson: LessonDtoSchema,
  status: AttendanceStatusSchema,
});
export type AttendanceHistoryItem = z.infer<typeof AttendanceHistoryItemSchema>;

/** Проверенная сдача в «последних результатах» родителя. */
export const AssignmentResultSchema = z.object({
  assignment: AssignmentBriefSchema,
  score: z.number().int(),
  maxScore: z.number().int().positive(),
  submittedAt: DateTimeSchema,
  isLate: z.boolean(),
});
export type AssignmentResult = z.infer<typeof AssignmentResultSchema>;

/** Сдача в истории ученика у преподавателя (может быть ещё не проверена). */
export const AssignmentHistoryItemSchema = z.object({
  assignment: AssignmentBriefSchema,
  score: z.number().int().nullable(),
  isLate: z.boolean(),
  submittedAt: DateTimeSchema,
});
export type AssignmentHistoryItem = z.infer<typeof AssignmentHistoryItemSchema>;

/**
 * Статус задания в аналитике родителя и в профиле ученика (цвет клетки): DONE — зелёный,
 * FAILED — красный, SOON — жёлтый (дедлайн ≤ 72 ч), LATER — серый. Правила — docs/04 §4.6.
 */
export const HOMEWORK_TASK_STATUSES = ['DONE', 'FAILED', 'SOON', 'LATER'] as const;
export const HomeworkTaskStatusSchema = z.enum(HOMEWORK_TASK_STATUSES);
export type HomeworkTaskStatus = z.infer<typeof HomeworkTaskStatusSchema>;

/** Итоги по заданиям: correct = DONE, wrong = FAILED, upcoming = SOON + LATER. */
export const HomeworkCountsSchema = z.object({
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
});
export type HomeworkCounts = z.infer<typeof HomeworkCountsSchema>;

/** Задание группы в сетке статусов. */
export const HomeworkTaskSchema = z.object({
  assignmentId: IdSchema,
  /** Порядковый номер внутри группы, с 1. */
  number: z.number().int().positive(),
  title: z.string(),
  status: HomeworkTaskStatusSchema,
  dueAt: DateTimeSchema.nullable(),
  /** Балл в процентах от максимума; null — не сдано или не проверено. */
  scorePercent: PercentSchema.nullable(),
});
export type HomeworkTask = z.infer<typeof HomeworkTaskSchema>;

/** Задания по кружку: полоса итогов + сетка статусов. */
export const ClubHomeworkSchema = z.object({
  club: ClubBriefSchema,
  group: GroupBriefSchema,
  counts: HomeworkCountsSchema,
  /** По порядку `number`. */
  tasks: z.array(HomeworkTaskSchema),
});
export type ClubHomework = z.infer<typeof ClubHomeworkSchema>;

// ---------- Ученик ----------

/** Статус дня в недельной дуге посещений на главной ученика. */
export const WEEK_DAY_STATUSES = ['ATTENDED', 'MISSED', 'TODAY', 'UPCOMING', 'NO_LESSONS'] as const;
export const WeekDayStatusSchema = z.enum(WEEK_DAY_STATUSES);
export type WeekDayStatus = z.infer<typeof WeekDayStatusSchema>;

/** День текущей недели (пн–вс) с итогом посещаемости; считает analytics. */
export const WeekDaySchema = z.object({
  date: DateOnlySchema,
  status: WeekDayStatusSchema,
});
export type WeekDay = z.infer<typeof WeekDaySchema>;

export const StudentHomeDtoSchema = z.object({
  today: z.array(LessonDtoSchema),
  /** Ближайшие 7 дней, не более 10. */
  upcoming: z.array(LessonDtoSchema),
  /** Открытые задания по дедлайну, не более 10. */
  tasks: z.array(AssignmentBriefSchema),
  stats: StatsBriefSchema,
  clubs: z.array(ClubProgressSchema),
  aiComment: AiTextSchema,
  /** Текущая неделя (7 дней, пн–вс) для дуги «Посещения»; нет — пока не посчитано. */
  week: z.array(WeekDaySchema).optional(),
  /** Серия: дни, пока посещение или сдача задания случаются не реже раза в 2 дня (docs/04 §4.6). */
  streakDays: z.number().int().nonnegative().optional(),
  /** Кристаллы: 50 за посещение + 20 за задание, выполненное больше чем на 75% (docs/04 §4.6). */
  points: z.number().int().nonnegative().optional(),
});
export type StudentHomeDto = z.infer<typeof StudentHomeDtoSchema>;

export const StudentProfileDtoSchema = z.object({
  user: UserBriefSchema,
  classLabel: z.string().nullable(),
  school: SchoolBriefSchema.nullable(),
  clubs: z.array(ClubProgressSchema),
  stats: StatsBriefSchema,
  interests: z.array(z.string()),
  goals: z.array(z.string()),
  /** Серия — как на главной (docs/04 §4.6); нет — пока не посчитано. */
  streakDays: z.number().int().nonnegative().optional(),
  /** Кристаллы — как на главной (docs/04 §4.6). */
  points: z.number().int().nonnegative().optional(),
  /** Текущая неделя (пн–вс) для дуги «Посещения» — как на главной. */
  week: z.array(WeekDaySchema).optional(),
  /** Итоги по заданиям («правильно» — как у кристаллов, docs/04 §4.6) для «Успеваемости». */
  homework: HomeworkCountsSchema.optional(),
  /** Задания по каждому кружку ученика. */
  clubHomework: z.array(ClubHomeworkSchema).optional(),
});
export type StudentProfileDto = z.infer<typeof StudentProfileDtoSchema>;

// ---------- Родитель ----------

export const TrendSchema = z.object({
  /** Разница attendanceRate с предыдущим периодом той же длины; null — нет данных. */
  attendanceDelta: z.number().nullable(),
  completionDelta: z.number().nullable(),
});
export type Trend = z.infer<typeof TrendSchema>;

export const ParentHomeDtoSchema = z.object({
  student: StudentBriefSchema,
  today: z.array(LessonDtoSchema),
  upcoming: z.array(LessonDtoSchema),
  /** Пропущенные (ABSENT) за 14 дней. */
  missed: z.array(LessonDtoSchema),
  /** Новые задания за 7 дней. */
  newAssignments: z.array(AssignmentBriefSchema),
  overdue: z.array(AssignmentBriefSchema),
  stats: StatsBriefSchema,
  trend: TrendSchema,
  aiSummary: AiTextSchema,
});
export type ParentHomeDto = z.infer<typeof ParentHomeDtoSchema>;

export const ChildAnalyticsDtoSchema = z.object({
  stats: StatsBriefSchema,
  clubs: z.array(ClubProgressSchema),
  weekly: z.array(WeeklyPointSchema),
  recentResults: z.array(AssignmentResultSchema),
  attendanceHistory: z.array(AttendanceHistoryItemSchema),
  aiSummary: AiTextSchema,
  /** Текущая неделя (пн–вс) для дуги «Посещения» — как на главной ученика. */
  week: z.array(WeekDaySchema).optional(),
  /** Итоги по всем заданиям для круговой диаграммы «Домашние задачи». */
  homework: HomeworkCountsSchema.optional(),
  /** Задания по каждому кружку ребёнка. */
  clubHomework: z.array(ClubHomeworkSchema).optional(),
});
export type ChildAnalyticsDto = z.infer<typeof ChildAnalyticsDtoSchema>;

/** Окна «Выполненные задания» на главной родителя, в днях. */
export const HOMEWORK_PROGRESS_DAYS = [1, 7, 30] as const;
export type HomeworkProgressDays = (typeof HOMEWORK_PROGRESS_DAYS)[number];
export const HOMEWORK_PROGRESS_DEFAULT_DAYS: HomeworkProgressDays = 7;

function isHomeworkProgressDays(value: number): value is HomeworkProgressDays {
  return (HOMEWORK_PROGRESS_DAYS as readonly number[]).includes(value);
}

/** Query-параметры прогресса: `?days=1|7|30` (строка из query приводится к числу), по умолчанию 7. */
export const HomeworkProgressQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine(isHomeworkProgressDays, { message: 'Ожидается 1, 7 или 30' })
    .default(HOMEWORK_PROGRESS_DEFAULT_DAYS),
});
export type HomeworkProgressQuery = z.infer<typeof HomeworkProgressQuerySchema>;

/** Прогресс по кружку за окно: done — сдано, recommended — задания с дедлайном в окне («*»). */
export const ClubHomeworkProgressSchema = z.object({
  club: ClubBriefSchema,
  group: GroupBriefSchema,
  done: z.number().int().nonnegative(),
  recommended: z.number().int().nonnegative(),
});
export type ClubHomeworkProgress = z.infer<typeof ClubHomeworkProgressSchema>;

export const ChildHomeworkProgressSchema = z.object({
  /** Окно, за которое посчитано. */
  days: z.number().int().positive(),
  items: z.array(ClubHomeworkProgressSchema),
});
export type ChildHomeworkProgress = z.infer<typeof ChildHomeworkProgressSchema>;

/** Языки подсветки кода в условии задания. */
export const CODE_SNIPPET_LANGUAGES = ['python', 'cpp', 'javascript', 'text'] as const;
export const CodeSnippetLanguageSchema = z.enum(CODE_SNIPPET_LANGUAGES);
export type CodeSnippetLanguage = z.infer<typeof CodeSnippetLanguageSchema>;

export const CodeSnippetSchema = z.object({
  language: CodeSnippetLanguageSchema,
  source: z.string(),
});
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;

/** Задание с условием и ответом — экран подробной аналитики заданий. */
export const HomeworkTaskDetailSchema = HomeworkTaskSchema.extend({
  statement: z.string(),
  code: CodeSnippetSchema.nullable(),
  /** Ответ ребёнка; null — не сдано. */
  answer: z.string().nullable(),
  /** Эталон; показывается только после проверки. */
  correctAnswer: z.string().nullable(),
  /** null — не сдано или не проверено. */
  score: z.number().int().nullable(),
  maxScore: z.number().int().positive(),
});
export type HomeworkTaskDetail = z.infer<typeof HomeworkTaskDetailSchema>;

export const GroupHomeworkTasksSchema = z.object({
  group: GroupBriefSchema,
  /** По порядку `number`. */
  items: z.array(HomeworkTaskDetailSchema),
});
export type GroupHomeworkTasks = z.infer<typeof GroupHomeworkTasksSchema>;

// ---------- Преподаватель ----------

export const GroupCardSchema = GroupBriefSchema.extend({
  studentsCount: z.number().int().nonnegative(),
  attendanceRate: RateSchema,
  completionRate: RateSchema,
  needsAttentionCount: z.number().int().nonnegative(),
  nextLesson: LessonDtoSchema.nullable(),
});
export type GroupCard = z.infer<typeof GroupCardSchema>;

export const GroupStudentRowSchema = z.object({
  student: StudentBriefSchema,
  attendanceRate: RateSchema,
  completionRate: RateSchema,
  progress: PercentSchema,
  activityScore: PercentSchema,
  /** Причины «требует внимания»; пустой массив — всё в порядке. */
  needsAttention: z.array(z.string()),
});
export type GroupStudentRow = z.infer<typeof GroupStudentRowSchema>;

export const GroupDetailSchema = GroupCardSchema.extend({
  schedule: z.array(ScheduleRuleDtoSchema),
  students: z.array(GroupStudentRowSchema),
});
export type GroupDetail = z.infer<typeof GroupDetailSchema>;

export const ToGradeItemSchema = z.object({
  assignment: AssignmentBriefSchema,
  pendingCount: z.number().int().nonnegative(),
});
export type ToGradeItem = z.infer<typeof ToGradeItemSchema>;

export const TeacherStatsSchema = z.object({
  groupsCount: z.number().int().nonnegative(),
  studentsCount: z.number().int().nonnegative(),
  avgAttendanceRate: RateSchema,
  avgCompletionRate: RateSchema,
  needsAttentionCount: z.number().int().nonnegative(),
});
export type TeacherStats = z.infer<typeof TeacherStatsSchema>;

export const TeacherHomeDtoSchema = z.object({
  today: z.array(LessonDtoSchema),
  upcoming: z.array(LessonDtoSchema),
  groups: z.array(GroupCardSchema),
  toGrade: z.array(ToGradeItemSchema),
  /** Последние 5 уведомлений. */
  events: z.array(NotificationSchema),
  stats: TeacherStatsSchema,
});
export type TeacherHomeDto = z.infer<typeof TeacherHomeDtoSchema>;

export const TeacherGroupsListSchema = z.object({ items: z.array(GroupCardSchema) });
export type TeacherGroupsList = z.infer<typeof TeacherGroupsListSchema>;

export const TeacherStudentCardSchema = z.object({
  student: StudentBriefSchema,
  groups: z.array(GroupBriefSchema),
  stats: StatsBriefSchema,
  clubs: z.array(ClubProgressSchema),
  weekly: z.array(WeeklyPointSchema),
  history: z.array(AssignmentHistoryItemSchema),
  attendanceHistory: z.array(AttendanceHistoryItemSchema),
  aiSummary: AiTextSchema,
  needsAttention: z.array(z.string()),
  /** Текущая неделя (пн–вс) для дуги «Посещения» — как на главной ученика; только группы преподавателя. */
  week: z.array(WeekDaySchema).optional(),
  /**
   * Итоги по заданиям групп преподавателя для круговой «Домашние задачи»;
   * «правильно» — порог родителя (docs/04 §4.6).
   */
  homework: HomeworkCountsSchema.optional(),
  /** Задания по каждому кружку ученика в группах преподавателя (полоса итогов + сетка статусов). */
  clubHomework: z.array(ClubHomeworkSchema).optional(),
});
export type TeacherStudentCard = z.infer<typeof TeacherStudentCardSchema>;

/** Периоды экрана «Общая успеваемость»: день, 7 дней, 30 дней, с начала учебного курса. */
export const TEACHER_PERFORMANCE_PERIODS = ['day', 'week', 'month', 'course'] as const;
export const TeacherPerformancePeriodSchema = z.enum(TEACHER_PERFORMANCE_PERIODS);
export type TeacherPerformancePeriod = z.infer<typeof TeacherPerformancePeriodSchema>;
export const TEACHER_PERFORMANCE_DEFAULT_PERIOD: TeacherPerformancePeriod = 'day';

/**
 * Query «Общей успеваемости»: `?period=day|week|month|course`, по умолчанию `day`.
 * Окна календарные: day — с начала сегодняшнего дня, week / month — 7 / 30 календарных дней
 * включая сегодняшний, course — с 1 сентября текущего учебного года (docs/04 §4.6).
 */
export const TeacherPerformanceQuerySchema = z.object({
  period: TeacherPerformancePeriodSchema.default(TEACHER_PERFORMANCE_DEFAULT_PERIOD),
});
export type TeacherPerformanceQuery = z.infer<typeof TeacherPerformanceQuerySchema>;

/** Счётчики группы за период (docs/04 §4.6); считает analytics. */
export const TeacherGroupPerformanceSchema = z
  .object({
    group: GroupBriefSchema,
    /** Активные ученики группы. */
    studentsCount: z.number().int().nonnegative(),
    /**
     * Отметки PRESENT/LATE на занятиях группы в периоде, которые уже начались (включая идущее
     * сейчас) и не отменены (docs/04 §4.6). Неотмеченные занятия не считаются.
     */
    attended: z.number().int().nonnegative(),
    /** Отметки ABSENT/EXCUSED на тех же занятиях. */
    missed: z.number().int().nonnegative(),
    /** Сдачи (задание × ученик, DONE или проверенный FAILED) по заданиям со сроком в периоде. */
    homeworkDone: z.number().int().nonnegative(),
    /** Из сданных — выполнены правильно (статус DONE по порогу §4.6). */
    homeworkCorrect: z.number().int().nonnegative(),
  })
  .refine((row) => row.homeworkCorrect <= row.homeworkDone, {
    message: 'homeworkCorrect не может превышать homeworkDone',
    path: ['homeworkCorrect'],
  });
export type TeacherGroupPerformance = z.infer<typeof TeacherGroupPerformanceSchema>;

export const TeacherPerformanceDtoSchema = z.object({
  period: TeacherPerformancePeriodSchema,
  /** Границы посчитанного окна: from — начало, to — момент расчёта. */
  from: DateTimeSchema,
  to: DateTimeSchema,
  /** Все активные группы преподавателя (и без занятий в периоде — с нулями). */
  groups: z.array(TeacherGroupPerformanceSchema),
});
export type TeacherPerformanceDto = z.infer<typeof TeacherPerformanceDtoSchema>;

// ---------- Роуты ----------

export const dashboardsContract = c.router(
  {
    getStudentHome: {
      method: 'GET',
      path: '/student/home',
      responses: { 200: StudentHomeDtoSchema },
      summary: 'Главная ученика: занятия, задания, статистика, ИИ-комментарий',
      metadata: userRoute('student:home.view'),
    },
    getStudentProfile: {
      method: 'GET',
      path: '/student/profile',
      responses: { 200: StudentProfileDtoSchema },
      summary: 'Профиль ученика с кружками и статистикой',
      metadata: userRoute('common:profile.view', ['STUDENT']),
    },
    getParentChildHome: {
      method: 'GET',
      path: '/parent/children/:studentId/home',
      pathParams: z.object({ studentId: IdSchema }),
      responses: { 200: ParentHomeDtoSchema },
      summary: 'Главная родителя по ребёнку',
      metadata: userRoute('parent:child.home.view'),
    },
    getParentChildAnalytics: {
      method: 'GET',
      path: '/parent/children/:studentId/analytics',
      pathParams: z.object({ studentId: IdSchema }),
      query: PeriodQuerySchema,
      responses: { 200: ChildAnalyticsDtoSchema },
      summary: 'Аналитика ребёнка за период',
      metadata: userRoute('parent:child.analytics.view'),
    },
    getParentChildHomeworkProgress: {
      method: 'GET',
      path: '/parent/children/:studentId/homework-progress',
      pathParams: z.object({ studentId: IdSchema }),
      query: HomeworkProgressQuerySchema,
      responses: { 200: ChildHomeworkProgressSchema },
      summary: 'Выполненные и рекомендованные задания ребёнка по кружкам за 1/7/30 дней',
      metadata: userRoute('parent:child.home.view'),
    },
    getParentChildGroupTasks: {
      method: 'GET',
      path: '/parent/children/:studentId/groups/:groupId/tasks',
      pathParams: z.object({ studentId: IdSchema, groupId: IdSchema }),
      responses: { 200: GroupHomeworkTasksSchema },
      summary: 'Задания группы ребёнка с условиями, ответами и статусами',
      metadata: userRoute('parent:child.analytics.view'),
    },
    getTeacherHome: {
      method: 'GET',
      path: '/teacher/home',
      responses: { 200: TeacherHomeDtoSchema },
      summary: 'Главная преподавателя',
      metadata: userRoute('teacher:home.view'),
    },
    listTeacherGroups: {
      method: 'GET',
      path: '/teacher/groups',
      responses: { 200: TeacherGroupsListSchema },
      summary: 'Группы преподавателя с показателями',
      metadata: userRoute('teacher:groups.view'),
    },
    getTeacherGroup: {
      method: 'GET',
      path: '/teacher/groups/:groupId',
      pathParams: z.object({ groupId: IdSchema }),
      responses: { 200: GroupDetailSchema },
      summary: 'Группа: расписание и ученики с показателями',
      metadata: userRoute('teacher:groups.view'),
    },
    getTeacherStudent: {
      method: 'GET',
      path: '/teacher/students/:studentId',
      pathParams: z.object({ studentId: IdSchema }),
      responses: { 200: TeacherStudentCardSchema },
      summary: 'Карточка ученика для преподавателя',
      metadata: userRoute('teacher:students.view'),
    },
    getTeacherStudentGroupTasks: {
      method: 'GET',
      path: '/teacher/students/:studentId/groups/:groupId/tasks',
      pathParams: z.object({ studentId: IdSchema, groupId: IdSchema }),
      responses: { 200: GroupHomeworkTasksSchema },
      summary: 'Задания группы преподавателя по ученику: условия, ответы, эталоны и статусы',
      metadata: userRoute('teacher:students.view'),
    },
    getTeacherPerformance: {
      method: 'GET',
      path: '/teacher/performance',
      query: TeacherPerformanceQuerySchema,
      responses: { 200: TeacherPerformanceDtoSchema },
      summary: 'Общая успеваемость по группам преподавателя за период: посещения и задания',
      metadata: userRoute('teacher:groups.view'),
    },
  },
  contractRouterOptions,
);
