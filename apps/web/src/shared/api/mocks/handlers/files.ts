/** Файлы: upload-url → PUT по локальной ссылке → confirm → get. Байты не хранятся, только мета. */
import { CreateUploadUrlBodySchema, FileDtoSchema, FILE_SIZE_LIMITS } from '@edu/contracts';
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
        createdAt: new Date().toISOString(),
      });
      return HttpResponse.json({
        fileId: id,
        uploadUrl: apiUrl(`/files/local/upload-${id}`),
        headers: { 'Content-Type': body.data.mime },
      });
    }),
  ),

  http.put<{ token: string }>(apiUrl('/files/local/:token'), async ({ params, request }) => {
    const id = params.token.replace(/^upload-/, '');
    const file = db.files.find((f) => f.id === id);
    if (!file) return apiError('NOT_FOUND', 'Файл не найден');
    file.uploaded = true;
    file.text = file.mime.startsWith('text/') ? await request.text() : null;
    return new HttpResponse(null, { status: 204 });
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
