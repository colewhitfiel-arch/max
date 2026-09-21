import { z } from 'zod';
import { FilePurposeSchema, FileStatusSchema, GenerationStageSchema } from '../enums';
import { DateTimeSchema, IdSchema, PercentSchema } from '../common/primitives';
import { CourseDraftSchema } from './course';
import { KnowledgeBaseSchema } from './knowledge';

export const FileSchema = z.object({
  id: IdSchema,
  fileName: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  purpose: FilePurposeSchema,
  status: FileStatusSchema,
  /** Presigned/временная ссылка на скачивание; null, пока файл не подтверждён. */
  url: z.string().nullable(),
  createdAt: DateTimeSchema,
});
export type File = z.infer<typeof FileSchema>;
export const FileDtoSchema = FileSchema;
export type FileDto = File;

/** Откуда берётся материал: загруженные файлы или тема/практика, по которой ИИ сам пишет конспект. */
export const GENERATION_SOURCE_KINDS = ['MATERIALS', 'TOPIC'] as const;
export const GenerationSourceKindSchema = z.enum(GENERATION_SOURCE_KINDS);
export type GenerationSourceKind = z.infer<typeof GenerationSourceKindSchema>;

/** Задача пайплайна «материалы → курс» (course-builder). */
export const CourseGenerationJobSchema = z.object({
  id: IdSchema,
  teacherId: IdSchema,
  groupId: IdSchema,
  courseId: IdSchema.nullable(),
  materials: z.array(FileSchema),
  instructions: z.string().nullable(),
  targetTitle: z.string().nullable(),
  /** По умолчанию MATERIALS (для задач, созданных до появления поля). */
  sourceKind: GenerationSourceKindSchema.optional(),
  /** Тема/описание практики для режима TOPIC (без конспекта). */
  topic: z.string().nullable().optional(),
  /** База знаний (атомы, узлы, план) — появляется после стадии OUTLINING. */
  knowledge: KnowledgeBaseSchema.nullable().optional(),
  stage: GenerationStageSchema,
  progress: PercentSchema,
  draft: CourseDraftSchema.nullable(),
  error: z.string().nullable(),
  createdAt: DateTimeSchema,
  startedAt: DateTimeSchema.nullable(),
  finishedAt: DateTimeSchema.nullable(),
});
export type CourseGenerationJob = z.infer<typeof CourseGenerationJobSchema>;
