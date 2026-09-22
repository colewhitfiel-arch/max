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
});
export type ChildAnalyticsDto = z.infer<typeof ChildAnalyticsDtoSchema>;

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
});
export type TeacherStudentCard = z.infer<typeof TeacherStudentCardSchema>;

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
  },
  contractRouterOptions,
);
