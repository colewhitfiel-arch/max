import { pipeline } from 'node:stream/promises';
import { Controller, Get, Param, Put, Req, Res } from '@nestjs/common';
import { filesContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import { FilesService } from './files.service';

/** Типы, которые безопасно показывать inline с origin API; остальное (html, svg…) — скачивание. */
const INLINE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

/** Реализация contracts/routes/files.ts + ручки загрузки/скачивания через api (STORAGE_DRIVER=local|postgres). */
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @RequirePermission('common:files.upload')
  @TsRestHandler(filesContract.createUploadUrl)
  createUploadUrl(@CurrentUser() user: AuthUser) {
    return tsRestHandler(filesContract.createUploadUrl, async ({ body }) => ({
      status: 200,
      body: await this.files.createUploadUrl(user, body),
    }));
  }

  @RequirePermission('common:files.upload')
  @TsRestHandler(filesContract.confirmUpload)
  confirmUpload(@CurrentUser() user: AuthUser) {
    return tsRestHandler(filesContract.confirmUpload, async ({ params }) => ({
      status: 200,
      body: await this.files.confirmUpload(user, params.fileId),
    }));
  }

  @TsRestHandler(filesContract.getFile)
  getFile(@CurrentUser() user: AuthUser) {
    return tsRestHandler(filesContract.getFile, async ({ params }) => ({
      status: 200,
      body: await this.files.getFile(user, params.fileId),
    }));
  }

  /** Локальный upload: тело запроса — байты файла; доступ по подписанному токену, без JWT. */
  @Public()
  @Put('files/local/:token')
  async putLocal(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const length = Number(req.header('content-length'));
    await this.files.putLocal(
      decodeURIComponent(token),
      req,
      req.header('content-type'),
      Number.isFinite(length) && length >= 0 ? length : undefined,
    );
    res.status(204).end();
  }

  @Public()
  @Get('files/local/:token')
  async getLocal(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const { stream, key, contentType } = await this.files.getLocal(decodeURIComponent(token));
    const name = key.split('/').pop() ?? 'file';
    const mime = contentType ?? 'application/octet-stream';
    const disposition = INLINE_MIME.has(mime) ? 'inline' : 'attachment';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    try {
      await pipeline(stream, res);
    } catch {
      // Ошибка чтения: до отправки заголовков — 500, после — только оборвать ответ
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    }
  }
}
