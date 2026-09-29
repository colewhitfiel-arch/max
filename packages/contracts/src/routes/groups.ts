/**
 * Календарь и занятия групп, свои группы преподавателя (создание, название, состав) и вступление
 * по ссылке. Владелец — B2.
 * docs/05-api-contracts.md §5.3 `groups.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  DateTimeSchema,
  IdSchema,
  MoneySchema,
  PeriodQuerySchema,
  TimeOfDaySchema,
} from '../common';
import {
  GroupBriefSchema,
  LessonDtoSchema,
  ScheduleRuleDtoSchema,
  StudentBriefSchema,
} from '../entities';
import { BillingPeriodSchema, ClubCategorySchema } from '../enums';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const LessonsListSchema = z.object({ lessons: z.array(LessonDtoSchema) });
export type LessonsList = z.infer<typeof LessonsListSchema>;

/** Ограничение длины названия группы (форма создания и переименования). */
export const GROUP_TITLE_MAX_LENGTH = 100;

/** Состав группы: активные ученики по алфавиту. */
export const GroupRosterSchema = z.object({
  groupId: IdSchema,
  students: z.array(StudentBriefSchema),
});
export type GroupRoster = z.infer<typeof GroupRosterSchema>;

/**
 * Кого можно добавить в группу: ученики школы преподавателя и ученики его других групп,
 * которых в этой группе ещё нет.
 */
export const GroupCandidatesSchema = z.object({ items: z.array(StudentBriefSchema) });
export type GroupCandidates = z.infer<typeof GroupCandidatesSchema>;
/**
 * Ссылка-приглашение в группу (docs/07 F19): многоразовая и бессрочная — преподаватель
 * рассылает её всем ученикам. Сброс выдаёт новую, старая перестаёт работать. `url` строит сервер
 * (`${WEB_URL}/join/${token}`; формат deep link MAX — workstream J).
 */
export const GroupInviteSchema = z.object({
  token: z.string().min(16),
  url: z.string().url(),
});
export type GroupInvite = z.infer<typeof GroupInviteSchema>;

export const CreatedGroupSchema = z.object({
  group: GroupBriefSchema,
  invite: GroupInviteSchema,
});
export type CreatedGroup = z.infer<typeof CreatedGroupSchema>;

/** Группа глазами ученика, открывшего ссылку: что за кружок, кто ведёт, когда и сколько стоит. */
export const GroupInvitePreviewSchema = z.object({
  token: z.string(),
  group: GroupBriefSchema,
  description: z.string(),
  schedule: z.array(ScheduleRuleDtoSchema),
  price: MoneySchema,
  billingPeriod: BillingPeriodSchema,
  /** Активные ученики группы. */
  studentsCount: z.number().int().nonnegative(),
  /** Ученик уже в группе — вступать не нужно. */
  joined: z.boolean(),
});
export type GroupInvitePreview = z.infer<typeof GroupInvitePreviewSchema>;

export const JoinGroupResultSchema = z.object({
  group: GroupBriefSchema,
  enrollmentId: IdSchema,
  /** true — ученик уже был в группе, повтор ничего не менял. */
  alreadyJoined: z.boolean(),
});
export type JoinGroupResult = z.infer<typeof JoinGroupResultSchema>;

// ---------- Тела запросов ----------

export const CreateLessonBodySchema = z
  .object({
    startsAt: DateTimeSchema,
    endsAt: DateTimeSchema,
    topic: z.string().min(1).optional(),
    room: z.string().min(1).optional(),
  })
  .refine((body) => Date.parse(body.endsAt) > Date.parse(body.startsAt), {
    message: 'Занятие должно заканчиваться позже начала',
    path: ['endsAt'],
  });
export type CreateLessonBody = z.infer<typeof CreateLessonBodySchema>;

/** null в topic/room — очистить поле. Отмена — `status: 'CANCELLED'` (+ причина). */
export const UpdateLessonBodySchema = z.object({
  topic: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  status: z.literal('CANCELLED').optional(),
  cancelReason: z.string().optional(),
});
export type UpdateLessonBody = z.infer<typeof UpdateLessonBodySchema>;

const GroupTitleSchema = z.string().trim().min(1).max(GROUP_TITLE_MAX_LENGTH);

/** Правило расписания новой группы: день недели (0 — воскресенье … 6 — суббота) и время. */
export const NewScheduleRuleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
    room: z.string().trim().min(1).max(60).optional(),
  })
  .refine((rule) => rule.endTime > rule.startTime, {
    message: 'Занятие должно заканчиваться позже начала',
    path: ['endTime'],
  });
export type NewScheduleRule = z.infer<typeof NewScheduleRuleSchema>;

/**
 * Новая группа преподавателя по любому из 8 кружков. Вместе с ней создаётся кружок в каталоге
 * школы (название, направление, описание и цена — те же), поэтому группа сразу видна ученикам
 * и родителям; занятия по расписанию — на 8 недель вперёд.
 */
export const CreateGroupBodySchema = z.object({
  category: ClubCategorySchema,
  /** «Английский для 5–6 классов». */
  title: GroupTitleSchema,
  description: z.string().trim().max(500).optional(),
  /** Цена за месяц; 0 — бесплатно. */
  price: MoneySchema,
  schedule: z.array(NewScheduleRuleSchema).max(14).default([]),
});
export type CreateGroupBody = z.input<typeof CreateGroupBodySchema>;

export const UpdateGroupBodySchema = z.object({ title: GroupTitleSchema });
export type UpdateGroupBody = z.infer<typeof UpdateGroupBodySchema>;

/** Поиск по имени/фамилии; пусто — все кандидаты. */
export const GroupCandidatesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});
export type GroupCandidatesQuery = z.infer<typeof GroupCandidatesQuerySchema>;

export const AddGroupStudentBodySchema = z.object({ studentId: IdSchema });
export type AddGroupStudentBody = z.infer<typeof AddGroupStudentBodySchema>;

// ---------- Роуты ----------

export const groupsContract = c.router(
  {
    getStudentCalendar: {
      method: 'GET',
      path: '/student/calendar',
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Календарь ученика за период (с его посещаемостью)',
      metadata: userRoute('student:calendar.view'),
    },
    getParentChildCalendar: {
      method: 'GET',
      path: '/parent/children/:studentId/calendar',
      pathParams: z.object({ studentId: IdSchema }),
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Календарь ребёнка за период',
      metadata: userRoute('parent:child.calendar.view'),
    },
    getTeacherCalendar: {
      method: 'GET',
      path: '/teacher/calendar',
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Календарь преподавателя за период: занятия всех его групп',
      metadata: userRoute('teacher:groups.view'),
    },
    listGroupLessons: {
      method: 'GET',
      path: '/teacher/groups/:groupId/lessons',
      pathParams: z.object({ groupId: IdSchema }),
      query: PeriodQuerySchema,
      responses: { 200: LessonsListSchema },
      summary: 'Занятия группы за период',
      metadata: userRoute('teacher:groups.view'),
    },
    createLesson: {
      method: 'POST',
      path: '/teacher/groups/:groupId/lessons',
      pathParams: z.object({ groupId: IdSchema }),
      body: CreateLessonBodySchema,
      responses: { 200: LessonDtoSchema },
      summary: 'Добавить разовое занятие в группу',
      metadata: userRoute('teacher:lessons.manage'),
    },
    createGroup: {
      method: 'POST',
      path: '/teacher/groups',
      body: CreateGroupBodySchema,
      responses: { 200: CreatedGroupSchema },
      summary: 'Создать свою группу (и кружок в каталоге) — сразу со ссылкой-приглашением',
      metadata: userRoute('teacher:groups.manage'),
    },
    getGroupInvite: {
      method: 'GET',
      path: '/teacher/groups/:groupId/invite',
      pathParams: z.object({ groupId: IdSchema }),
      responses: { 200: GroupInviteSchema },
      summary: 'Ссылка-приглашение в группу (создаётся при первом запросе)',
      metadata: userRoute('teacher:groups.manage'),
    },
    resetGroupInvite: {
      method: 'POST',
      path: '/teacher/groups/:groupId/invite/reset',
      pathParams: z.object({ groupId: IdSchema }),
      body: c.noBody(),
      responses: { 200: GroupInviteSchema },
      summary: 'Сбросить ссылку-приглашение: старая перестаёт работать',
      metadata: userRoute('teacher:groups.manage'),
    },
    getGroupInvitePreview: {
      method: 'GET',
      path: '/student/group-invites/:token',
      pathParams: z.object({ token: z.string().min(1) }),
      responses: { 200: GroupInvitePreviewSchema },
      summary: 'Группа по ссылке-приглашению (404 — ссылка сброшена или группа закрыта)',
      metadata: userRoute('student:groups.join'),
    },
    joinGroup: {
      method: 'POST',
      path: '/student/group-invites/:token/join',
      pathParams: z.object({ token: z.string().min(1) }),
      body: c.noBody(),
      responses: { 200: JoinGroupResultSchema },
      summary: 'Вступить в группу по ссылке (идемпотентно)',
      metadata: userRoute('student:groups.join'),
    },
    updateLesson: {
      method: 'PATCH',
      path: '/teacher/lessons/:lessonId',
      pathParams: z.object({ lessonId: IdSchema }),
      body: UpdateLessonBodySchema,
      responses: { 200: LessonDtoSchema },
      summary: 'Изменить тему/кабинет занятия или отменить его',
      metadata: userRoute('teacher:lessons.manage'),
    },
    updateGroup: {
      method: 'PATCH',
      path: '/teacher/groups/:groupId',
      pathParams: z.object({ groupId: IdSchema }),
      body: UpdateGroupBodySchema,
      responses: { 200: GroupBriefSchema },
      summary: 'Переименовать группу',
      metadata: userRoute('teacher:groups.manage'),
    },
    listGroupCandidates: {
      method: 'GET',
      path: '/teacher/groups/:groupId/candidates',
      pathParams: z.object({ groupId: IdSchema }),
      query: GroupCandidatesQuerySchema,
      responses: { 200: GroupCandidatesSchema },
      summary: 'Ученики, которых можно добавить в группу',
      metadata: userRoute('teacher:groups.manage'),
    },
    addGroupStudent: {
      method: 'POST',
      path: '/teacher/groups/:groupId/students',
      pathParams: z.object({ groupId: IdSchema }),
      body: AddGroupStudentBodySchema,
      responses: { 200: GroupRosterSchema },
      summary: 'Добавить ученика в группу (идемпотентно)',
      metadata: userRoute('teacher:groups.manage'),
    },
    removeGroupStudent: {
      method: 'DELETE',
      path: '/teacher/groups/:groupId/students/:studentId',
      pathParams: z.object({ groupId: IdSchema, studentId: IdSchema }),
      body: c.noBody(),
      responses: { 200: GroupRosterSchema },
      summary: 'Убрать ученика из группы (зачисление → LEFT, история сохраняется)',
      metadata: userRoute('teacher:groups.manage'),
    },
  },
  contractRouterOptions,
);
