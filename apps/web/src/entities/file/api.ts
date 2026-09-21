import type { FileDto, FilePurpose } from '@edu/contracts';
import { useMutation } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { ApiClientError } from '@/shared/api/errors';

export interface UploadFileInput {
  file: File;
  purpose: FilePurpose;
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
        mime: file.type || 'application/octet-stream',
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
