import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prepareTestDatabase } from '@edu/db/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { testEnv } from './env';

let dbReady = false;

/**
 * Полное приложение для интеграционных тестов: реальная тестовая БД (DATABASE_URL_TEST),
 * миграции + seed демо-мира применяются один раз на процесс.
 */
export async function createTestApp(): Promise<INestApplication> {
  if (!dbReady) {
    prepareTestDatabase({ seed: true });
    dbReady = true;
  }
  const env = testEnv({ DATABASE_URL: process.env.DATABASE_URL_TEST ?? '' });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(env, 'api')],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, env);
  await app.init();
  return app;
}

export const hasTestDatabase =
  Boolean(process.env.DATABASE_URL_TEST) && process.env.SKIP_DB_TESTS !== '1';
