import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

/** files: загрузка/подтверждение/получение файлов и извлечение текста. Публичный сервис — FilesService. */
@Module({
  controllers: [FilesController],
  providers: [FilesRepository, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
