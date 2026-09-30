import type { FileDto, FilePurpose } from '@edu/contracts';
import { useMutation } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { ApiClientError } from '@/shared/api/errors';

export interface UploadFileInput {
  file: File;
  purpose: FilePurpose;
}

/** MIME по расширению: браузеры (особенно на Windows) не знают тип у .md и отдают пустую строку. */
const MIME_BY_EXTENSION: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export function mimeOf(file: Pick<File, 'name' | 'type'>): string {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const known = MIME_BY_EXTENSION[extension];
  // Тип от браузера — первым, кроме «не знаю» (пусто или octet-stream) при знакомом расширении.
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return known ?? (file.type || 'application/octet-stream');
}

/**
 * Загрузка файла в три шага (F8): `POST /files/upload-url` → PUT байтов по выданной ссылке
 * (это хранилище или локальная ручка api, не контракт — поэтому обычный fetch) → `POST /files/:id/confirm`.
 */
export async function uploadFile({ file, purpose }: UploadFileInput): Promise<FileDto> {
  const target = await call(
    api.files.createUploadUrl({
      body: {
        fileName: file.name,
        mime: mimeOf(file),
        sizeBytes: file.size,
        purpose,
      },
    }),
  );
  const put = await fetch(target.uploadUrl, { method: 'PUT', headers: target.headers, body: file });
  if (!put.ok) {
    throw new ApiClientError({
      code: 'EXTERNAL_INTEGRATION',
      message: 'Не удалось загрузить файл в хранилище',
      status: put.status,
    });
  }
  return call(api.files.confirmUpload({ params: { fileId: target.fileId } }));
}

export function useUploadFile() {
  return useMutation({ mutationFn: uploadFile });
}
