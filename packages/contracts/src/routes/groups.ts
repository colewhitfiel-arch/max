/**
 * Календарь и занятия групп. Владелец — B2.
 * docs/05-api-contracts.md §5.3 `groups.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateTimeSchema, IdSchema, PeriodQuerySchema } from '../common';
import { GroupBriefSchema, LessonDtoSchema, StudentBriefSchema } from '../entities';
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

/** Новая группа преподавателя: название и кружок его школы (кружок задаёт цену и каталог). */
export const CreateGroupBodySchema = z.object({
  title: GroupTitleSchema,
  clubId: IdSchema,
});
export type CreateGroupBody = z.infer<typeof CreateGroupBodySchema>;

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
    updateLesson: {
      method: 'PATCH',
      path: '/teacher/lessons/:lessonId',
      pathParams: z.object({ lessonId: IdSchema }),
      body: UpdateLessonBodySchema,
      responses: { 200: LessonDtoSchema },
      summary: 'Изменить тему/кабинет занятия или отменить его',
      metadata: userRoute('teacher:lessons.manage'),
    },
    createGroup: {
      method: 'POST',
      path: '/teacher/groups',
      body: CreateGroupBodySchema,
      responses: { 200: GroupBriefSchema },
      summary: 'Создать группу преподавателя (кружок — из его школы)',
      metadata: userRoute('teacher:groups.manage'),
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
