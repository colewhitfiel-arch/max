import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { type Env } from '../../../config/env';
import { ENV } from '../../../config/env.module';
import { LocalFsStorage } from './local-fs.storage';
import { PostgresStorage } from './postgres.storage';
import { S3Storage } from './s3.storage';
import { STORAGE, type StorageProvider } from './storage-provider';

/** Выбор реализации хранилища по STORAGE_DRIVER. Инъекция: `@Inject(STORAGE) storage: StorageProvider`. */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ENV, PrismaService],
      useFactory: (env: Env, prisma: PrismaService): StorageProvider => {
        if (env.STORAGE_DRIVER === 's3') {
          return new S3Storage({
            endpoint: env.S3_ENDPOINT!,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET!,
            accessKey: env.S3_ACCESS_KEY!,
            secretKey: env.S3_SECRET_KEY!,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
          });
        }
        if (env.STORAGE_DRIVER === 'postgres') {
          return new PostgresStorage(prisma, { apiUrl: env.API_URL, secret: env.JWT_SECRET });
        }
        return new LocalFsStorage({
          rootDir: env.STORAGE_LOCAL_DIR,
          apiUrl: env.API_URL,
          secret: env.JWT_SECRET,
        });
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
