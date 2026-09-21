import { z } from 'zod';
import { FilePurposeSchema, FileStatusSchema, GenerationStageSchema } from '../enums';
import { DateTimeSchema, IdSchema, PercentSchema } from '../common/primitives';
import { CourseDraftSchema } from './course';

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

/** Задача пайплайна «материалы → курс» (course-builder). */
export const CourseGenerationJobSchema = z.object({
  id: IdSchema,
  teacherId: IdSchema,
  groupId: IdSchema,
  courseId: IdSchema.nullable(),
  materials: z.array(FileSchema),
  instructions: z.string().nullable(),
  targetTitle: z.string().nullable(),
  stage: GenerationStageSchema,
  progress: PercentSchema,
  draft: CourseDraftSchema.nullable(),
  error: z.string().nullable(),
  createdAt: DateTimeSchema,
  startedAt: DateTimeSchema.nullable(),
  finishedAt: DateTimeSchema.nullable(),
});
export type CourseGenerationJob = z.infer<typeof CourseGenerationJobSchema>;
