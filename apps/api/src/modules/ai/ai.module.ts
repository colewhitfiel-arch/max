import { Global, Module } from '@nestjs/common';
import { AiService } from '@edu/ai';
import { AppLogger } from '../../common/logger/logger.service';
import { type Env } from '../../config/env';
import { ENV } from '../../config/env.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CoursesModule } from '../courses/courses.module';
import { FamilyModule } from '../family/family.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { AiStreamController } from './ai-stream.controller';
import { AiController } from './ai.controller';
import { AiEvents } from './ai.events';
import { buildAiService } from './ai.factory';
import { AiJobs } from './ai.jobs';
import { AiRepository } from './ai.repository';
import { StudentContextBuilder } from './context-builder';
import { OnboardingService } from './onboarding.service';
import { ParentTutorService } from './parent-tutor.service';
import { TrajectoryService } from './trajectory.service';
import { TutorService } from './tutor.service';

/**
 * Модуль ai (M09): AiService (mock | gigachat по AI_PROVIDER) — глобально; поверх него —
 * онбординг с подбором кружков, тьютор ученика и родителя (SSE) и персональная траектория
 * (workstream C).
 * Никакой модуль не импортирует GigaChat напрямую — только AiService.
 */
@Global()
@Module({
  imports: [IdentityModule, GroupsModule, CatalogModule, CoursesModule, FamilyModule],
  controllers: [AiController, AiStreamController],
  providers: [
    {
      provide: AiService,
      inject: [ENV, AppLogger],
      useFactory: (env: Env, logger: AppLogger) =>
        buildAiService(env, logger.child({ module: 'ai' })),
    },
    AiRepository,
    StudentContextBuilder,
    TutorService,
    ParentTutorService,
    OnboardingService,
    TrajectoryService,
    AiJobs,
    AiEvents,
  ],
  exports: [AiService, StudentContextBuilder],
})
export class AiModule {}
