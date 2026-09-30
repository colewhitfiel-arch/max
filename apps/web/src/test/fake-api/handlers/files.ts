/**
 * Файлы: upload-url → PUT по локальной ссылке → confirm → get. Хранится мета, байты (отдаются по
 * ссылке `url`), текст для text/*; для картинок (аватар) — ещё локальная object URL.
 */
import {
  CreateUploadUrlBodySchema,
  FileDtoSchema,
  FILE_SIZE_LIMITS,
  UploadUrlResultSchema,
} from '@edu/contracts';
import { http, HttpResponse } from 'msw';
import { apiError, apiUrl, authed, json, readBody } from '../lib';
import { db } from '../state';

const fileDto = (file: (typeof db.files)[number]) => ({
  id: file.id,
  fileName: file.fileName,
  mime: file.mime,
  sizeBytes: file.sizeBytes,
  purpose: file.purpose,
  status: file.status,
  url: file.confirmed ? apiUrl(`/files/local/download-${file.id}`) : null,
  createdAt: file.createdAt,
});

/** Локальная ссылка на байты (браузер и Node ≥ 16); без поддержки — null, тогда берут `url`. */
function objectUrlOf(blob: Blob): string | null {
  try {
    return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export const filesHandlers = [
  http.post(
    apiUrl('/files/upload-url'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, CreateUploadUrlBodySchema);
      if (!body.ok) return body.response;
      if (body.data.sizeBytes > FILE_SIZE_LIMITS[body.data.purpose]) {
        return apiError('VALIDATION', 'Файл больше допустимого размера');
      }
      const id = crypto.randomUUID();
      db.files.push({
        id,
        ownerUserId: auth.user.id,
        fileName: body.data.fileName,
        mime: body.data.mime,
        sizeBytes: body.data.sizeBytes,
        purpose: body.data.purpose,
        status: 'UPLOADED',
        url: null,
        confirmed: false,
        uploaded: false,
        text: null,
        blob: null,
        objectUrl: null,
        createdAt: new Date().toISOString(),
      });
      // Контракт требует абсолютный URL: относительный VITE_API_URL достраиваем от адреса страницы.
      const uploadUrl = new URL(
        apiUrl(`/files/local/upload-${id}`),
        globalThis.location?.href ?? 'http://localhost',
      ).href;
      return json(UploadUrlResultSchema, {
        fileId: id,
        uploadUrl,
        headers: { 'Content-Type': body.data.mime },
      });
    }),
  ),

  http.put<{ token: string }>(apiUrl('/files/local/:token'), async ({ params, request }) => {
    const id = params.token.replace(/^upload-/, '');
    const file = db.files.find((f) => f.id === id);
    if (!file) return apiError('NOT_FOUND', 'Файл не найден');
    file.uploaded = true;
    // Тело читается один раз: байты храним всегда (ссылка `url` из FileDto рабочая для любого
    // типа), текст для text/* — из тех же байт.
    const bytes = await request.arrayBuffer();
    file.blob = new Blob([bytes], { type: file.mime });
    // Текст — из байт, а не `blob.text()`: у Blob из jsdom этого метода нет.
    file.text = file.mime.startsWith('text/') ? new TextDecoder().decode(bytes) : null;
    if (file.mime.startsWith('image/')) file.objectUrl = objectUrlOf(file.blob);
    return new HttpResponse(null, { status: 204 });
  }),

  // «Скачивание» по `url` из FileDto: отдаём сохранённые байты файла.
  http.get<{ token: string }>(apiUrl('/files/local/:token'), ({ params }) => {
    const id = params.token.replace(/^download-/, '');
    const file = db.files.find((f) => f.id === id && f.confirmed);
    if (!file?.blob) return apiError('NOT_FOUND', 'Файл не найден');
    return new HttpResponse(file.blob, { headers: { 'Content-Type': file.mime } });
  }),

  http.post<{ fileId: string }>(
    apiUrl('/files/:fileId/confirm'),
    authed(({ auth, params }) => {
      const file = db.files.find((f) => f.id === params.fileId && f.ownerUserId === auth.user.id);
      if (!file) return apiError('NOT_FOUND', 'Файл не найден');
      if (!file.uploaded) return apiError('BUSINESS_RULE', 'Файл ещё не загружен в хранилище');
      file.confirmed = true;
      return json(FileDtoSchema, fileDto(file));
    }),
  ),

  http.get<{ fileId: string }>(
    apiUrl('/files/:fileId'),
    authed(({ auth, params }) => {
      const file = db.files.find((f) => f.id === params.fileId && f.ownerUserId === auth.user.id);
      if (!file) return apiError('NOT_FOUND', 'Файл не найден');
      return json(FileDtoSchema, fileDto(file));
    }),
  ),
];

export { fileDto };
