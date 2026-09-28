import { Controller } from '@nestjs/common';
import { courseBuilderContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit';
import { CourseBuilderService } from './course-builder.service';

/** Реализация contracts/routes/course-builder.ts. */
@Controller()
@RequirePermission('teacher:course-builder.use')
export class CourseBuilderController {
  constructor(private readonly service: CourseBuilderService) {}

  @RateLimit('ai')
  @TsRestHandler(courseBuilderContract.createGenerationJob)
  create(@CurrentUser() user: AuthUser) {
    return tsRestHandler(courseBuilderContract.createGenerationJob, async ({ body }) => ({
      status: 200,
      body: await this.service.create(user, body),
    }));
  }

  @TsRestHandler(courseBuilderContract.listGenerationJobs)
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(courseBuilderContract.listGenerationJobs, async ({ query }) => ({
      status: 200,
      body: await this.service.list(user, query),
    }));
  }

  @TsRestHandler(courseBuilderContract.getGenerationJob)
  get(@CurrentUser() user: AuthUser) {
    return tsRestHandler(courseBuilderContract.getGenerationJob, async ({ params }) => ({
      status: 200,
      body: await this.service.get(user, params.jobId),
    }));
  }

  @TsRestHandler(courseBuilderContract.updateGenerationDraft)
  updateDraft(@CurrentUser() user: AuthUser) {
    return tsRestHandler(courseBuilderContract.updateGenerationDraft, async ({ params, body }) => ({
      status: 200,
      body: await this.service.updateDraft(user, params.jobId, body.draft),
    }));
  }

  @TsRestHandler(courseBuilderContract.acceptGenerationJob)
  accept(@CurrentUser() user: AuthUser) {
    return tsRestHandler(courseBuilderContract.acceptGenerationJob, async ({ params }) => ({
      status: 200,
      body: await this.service.accept(user, params.jobId),
    }));
  }

  @TsRestHandler(courseBuilderContract.cancelGenerationJob)
  cancel(@CurrentUser() user: AuthUser) {
    return tsRestHandler(courseBuilderContract.cancelGenerationJob, async ({ params }) => ({
      status: 200,
      body: await this.service.cancel(user, params.jobId),
    }));
  }
}
