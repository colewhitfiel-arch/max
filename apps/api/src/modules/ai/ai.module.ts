import { Global, Module } from '@nestjs/common';
import { AiService } from '@edu/ai';
import { AppLogger } from '../../common/logger/logger.service';
import { type Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { buildAiService } from './ai.factory';

/**
 * Модуль ai (M09). Foundation: предоставляет AiService (mock | gigachat по AI_PROVIDER).
 * Диалоги, контекст ученика, инсайты и траектория — задачи Agent C / Agent K.
 * Никакой модуль не импортирует GigaChat напрямую — только AiService.
 */
@Global()
@Module({
  providers: [
    {
      provide: AiService,
      inject: [ENV, AppLogger],
      useFactory: (env: Env, logger: AppLogger) =>
        buildAiService(env, logger.child({ module: 'ai' })),
    },
  ],
  exports: [AiService],
})
export class AiModule {}
