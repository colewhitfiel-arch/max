import { Controller, Get, Param, Put, Req, Res } from '@nestjs/common';
import { filesContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import { FilesService } from './files.service';

/** Реализация contracts/routes/files.ts + локальные ручки загрузки/скачивания (STORAGE_DRIVER=local). */
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
    await this.files.putLocal(decodeURIComponent(token), req, req.header('content-type'));
    res.status(204).end();
  }

  @Public()
  @Get('files/local/:token')
  async getLocal(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const { stream, key } = await this.files.getLocal(decodeURIComponent(token));
    const name = key.split('/').pop() ?? 'file';
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    stream.pipe(res);
  }
}
