/**
 * Конструктор курса из материалов (ИИ-пайплайн). Владелец — A5 (скелет — F4).
 * docs/05-api-contracts.md §5.3 `course-builder.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema, PaginationQuerySchema, paginated } from '../common';
import { CourseDraftSchema, CourseGenerationJobSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const GenerationJobDtoSchema = CourseGenerationJobSchema;
export type GenerationJobDto = z.infer<typeof GenerationJobDtoSchema>;

/** Элемент списка задач — без тяжёлого черновика. */
export const GenerationJobListItemSchema = CourseGenerationJobSchema.omit({ draft: true });
export type GenerationJobListItem = z.infer<typeof GenerationJobListItemSchema>;

export const AcceptGenerationJobResultSchema = z.object({ courseId: IdSchema });
export type AcceptGenerationJobResult = z.infer<typeof AcceptGenerationJobResultSchema>;

// ---------- Тела запросов ----------

export const CreateGenerationJobBodySchema = z.object({
  groupId: IdSchema,
  /** Файлы с purpose = MATERIAL. */
  materialIds: z.array(IdSchema).min(1),
  instructions: z.string().optional(),
  targetTitle: z.string().min(1).optional(),
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
      summary: 'Принять черновик: создать Course (DRAFT), stage → ACCEPTED',
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
