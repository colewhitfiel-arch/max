/**
 * Файлы: presigned-загрузка, подтверждение, получение. Владелец — B7.
 * docs/05-api-contracts.md §5.3 `files.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema } from '../common';
import { type FilePurpose, FilePurposeSchema } from '../enums';
import { FileDtoSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

const MB = 1024 * 1024;

/** Лимиты размера по назначению файла (docs/05 §5.3 `files.ts`). */
export const FILE_SIZE_LIMITS: Record<FilePurpose, number> = {
  MATERIAL: 50 * MB,
  SUBMISSION: 20 * MB,
  BLOCK_MEDIA: 200 * MB,
  AVATAR: 2 * MB,
};

/** Допустимые MIME для материалов курса. */
export const MATERIAL_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
] as const;

// ---------- DTO ----------

export const UploadUrlResultSchema = z.object({
  fileId: IdSchema,
  /** Presigned PUT-ссылка в хранилище. */
  uploadUrl: z.string().url(),
  /** Заголовки, которые нужно передать при PUT. */
  headers: z.record(z.string(), z.string()),
});
export type UploadUrlResult = z.infer<typeof UploadUrlResultSchema>;

// ---------- Тела запросов ----------

export const CreateUploadUrlBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  purpose: FilePurposeSchema,
});
export type CreateUploadUrlBody = z.infer<typeof CreateUploadUrlBodySchema>;

// ---------- Роуты ----------

export const filesContract = c.router(
  {
    createUploadUrl: {
      method: 'POST',
      path: '/files/upload-url',
      body: CreateUploadUrlBodySchema,
      responses: { 200: UploadUrlResultSchema },
      summary: 'Получить presigned-ссылку для загрузки файла',
      metadata: userRoute('common:files.upload'),
    },
    confirmUpload: {
      method: 'POST',
      path: '/files/:fileId/confirm',
      pathParams: z.object({ fileId: IdSchema }),
      body: c.noBody(),
      responses: { 200: FileDtoSchema },
      summary: 'Подтвердить загрузку файла в хранилище',
      metadata: userRoute('common:files.upload'),
    },
    getFile: {
      method: 'GET',
      path: '/files/:fileId',
      pathParams: z.object({ fileId: IdSchema }),
      responses: { 200: FileDtoSchema },
      summary: 'Файл с временной ссылкой на скачивание (доступ по policies)',
      metadata: userRoute(),
    },
  },
  contractRouterOptions,
);
