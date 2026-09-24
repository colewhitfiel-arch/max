/**
 * Конструктор курса из материалов (ИИ-пайплайн). Владелец — A5 (скелет — F4).
 * docs/05-api-contracts.md §5.3 `course-builder.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateTimeSchema, IdSchema, PaginationQuerySchema, paginated } from '../common';
import { CourseDraftSchema, CourseGenerationJobSchema, GenerationTargetSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const GenerationJobDtoSchema = CourseGenerationJobSchema;
export type GenerationJobDto = z.infer<typeof GenerationJobDtoSchema>;

/** Элемент списка задач — без тяжёлого черновика и базы знаний. */
export const GenerationJobListItemSchema = CourseGenerationJobSchema.omit({
  draft: true,
  knowledge: true,
});
export type GenerationJobListItem = z.infer<typeof GenerationJobListItemSchema>;

export const AcceptGenerationJobResultSchema = z.object({
  courseId: IdSchema,
  /**
   * Сколько заданий создано при принятии. В режиме `HOMEWORK` модуль публикуется сразу — ученики
   * получают задания без отдельной публикации курса; в режиме `COURSE` всегда 0.
   */
  assignmentsCreated: z.number().int().nonnegative().default(0),
});
export type AcceptGenerationJobResult = z.infer<typeof AcceptGenerationJobResultSchema>;

// ---------- Тела запросов ----------

export const TOPIC_MIN_LENGTH = 10;
export const TOPIC_MAX_LENGTH = 4000;

/**
 * Источник: из файлов (`materialIds`) или по теме без конспекта (`topic` — тема, программа
 * занятия или описание практики; ИИ сам пишет конспект-атомы и прогоняет его по пайплайну).
 * Нужно задать хотя бы одно из двух.
 *
 * Цель (`target`): `COURSE` — целый курс из нескольких модулей; `HOMEWORK` — одно ДЗ, ровно один
 * модуль. И то и другое можно положить в уже существующий курс группы (`targetCourseId`) —
 * тогда курс дополняется, а ученик продолжает проходить его же.
 */
export const CreateGenerationJobBodySchema = z
  .object({
    groupId: IdSchema,
    /** Файлы с purpose = MATERIAL. */
    materialIds: z.array(IdSchema).optional(),
    /** Тема / практика своими словами (режим без конспекта). */
    topic: z.string().trim().min(TOPIC_MIN_LENGTH).max(TOPIC_MAX_LENGTH).optional(),
    instructions: z.string().max(2000).optional(),
    targetTitle: z.string().min(1).max(200).optional(),
    /** По умолчанию COURSE. */
    target: GenerationTargetSchema.optional(),
    /** Курс той же группы, который нужно дополнить; не задан — будет создан новый. */
    targetCourseId: IdSchema.optional(),
    /** Кому адресовать задания модуля: не задан или пустой — всей группе. */
    studentIds: z.array(IdSchema).optional(),
    /** Дедлайн заданий модуля. */
    dueAt: DateTimeSchema.optional(),
  })
  .refine((body) => (body.materialIds?.length ?? 0) > 0 || !!body.topic, {
    message: 'Укажи файлы материалов или опиши тему',
    path: ['topic'],
  });
export type CreateGenerationJobBody = z.infer<typeof CreateGenerationJobBodySchema>;

export const UpdateGenerationDraftBodySchema = z.object({
  draft: CourseDraftSchema,
});
export type UpdateGenerationDraftBody = z.infer<typeof UpdateGenerationDraftBodySchema>;

// ---------- Роуты ----------

export const courseBuilderContract = c.router(
  {
    createGenerationJob: {
      method: 'POST',
      path: '/teacher/course-builder/jobs',
      body: CreateGenerationJobBodySchema,
      responses: { 200: GenerationJobDtoSchema },
      summary: 'Запустить генерацию курса из материалов',
      metadata: userRoute('teacher:course-builder.use'),
    },
    listGenerationJobs: {
      method: 'GET',
      path: '/teacher/course-builder/jobs',
      query: PaginationQuerySchema,
      responses: { 200: paginated(GenerationJobListItemSchema) },
      summary: 'Задачи генерации преподавателя',
      metadata: userRoute('teacher:course-builder.use'),
    },
    getGenerationJob: {
      method: 'GET',
      path: '/teacher/course-builder/jobs/:jobId',
      pathParams: z.object({ jobId: IdSchema }),
      responses: { 200: GenerationJobDtoSchema },
      summary: 'Задача генерации с черновиком',
      metadata: userRoute('teacher:course-builder.use'),
    },
    updateGenerationDraft: {
      method: 'PUT',
      path: '/teacher/course-builder/jobs/:jobId/draft',
      pathParams: z.object({ jobId: IdSchema }),
      body: UpdateGenerationDraftBodySchema,
      responses: { 200: GenerationJobDtoSchema },
      summary: 'Изменить черновик до принятия',
      metadata: userRoute('teacher:course-builder.use'),
    },
    acceptGenerationJob: {
      method: 'POST',
      path: '/teacher/course-builder/jobs/:jobId/accept',
      pathParams: z.object({ jobId: IdSchema }),
      body: c.noBody(),
      responses: { 200: AcceptGenerationJobResultSchema },
      summary:
        'Принять черновик: создать Course (DRAFT) или дополнить существующий; HOMEWORK публикуется сразу',
      metadata: userRoute('teacher:course-builder.use'),
    },
    cancelGenerationJob: {
      method: 'POST',
      path: '/teacher/course-builder/jobs/:jobId/cancel',
      pathParams: z.object({ jobId: IdSchema }),
      body: c.noBody(),
      responses: { 200: GenerationJobDtoSchema },
      summary: 'Отменить генерацию',
      metadata: userRoute('teacher:course-builder.use'),
    },
  },
  contractRouterOptions,
);
