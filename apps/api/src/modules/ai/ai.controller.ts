import { Controller } from '@nestjs/common';
import { aiContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { OnboardingService } from './onboarding.service';
import { TrajectoryService } from './trajectory.service';
import { TutorService } from './tutor.service';

/** Реализация contracts/routes/ai.ts (SSE-ручки — в AiStreamController). */
@Controller()
export class AiController {
  constructor(
    private readonly tutor: TutorService,
    private readonly onboarding: OnboardingService,
    private readonly trajectory: TrajectoryService,
  ) {}

  @RequirePermission('student:onboarding.complete')
  @TsRestHandler(aiContract.startOnboarding)
  startOnboarding(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.startOnboarding, async () => ({
      status: 200,
      body: await this.onboarding.start(user),
    }));
  }

  @RequirePermission('student:onboarding.complete')
  @TsRestHandler(aiContract.getOnboardingRecommendations)
  getOnboardingRecommendations(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.getOnboardingRecommendations, async () => ({
      status: 200,
      body: await this.onboarding.recommendations(user),
    }));
  }

  @RequirePermission('student:onboarding.complete')
  @TsRestHandler(aiContract.completeOnboarding)
  completeOnboarding(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.completeOnboarding, async ({ body }) => ({
      status: 200,
      body: await this.onboarding.complete(user, body),
    }));
  }

  @RequirePermission('teacher:students.view')
  @TsRestHandler(aiContract.getClubDemand)
  getClubDemand(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.getClubDemand, async () => ({
      status: 200,
      body: await this.onboarding.demand(user),
    }));
  }

  @RequirePermission('student:tutor.chat')
  @TsRestHandler(aiContract.listConversations)
  listConversations(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.listConversations, async ({ query }) => ({
      status: 200,
      body: await this.tutor.listConversations(user, query),
    }));
  }

  @RequirePermission('student:tutor.chat')
  @TsRestHandler(aiContract.createConversation)
  createConversation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.createConversation, async () => ({
      status: 200,
      body: await this.tutor.createConversation(user),
    }));
  }

  @RequirePermission('student:tutor.chat')
  @TsRestHandler(aiContract.listConversationMessages)
  listConversationMessages(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.listConversationMessages, async ({ params, query }) => ({
      status: 200,
      body: await this.tutor.listMessages(user, params.conversationId, query),
    }));
  }

  @RequirePermission('student:tutor.chat')
  @TsRestHandler(aiContract.deleteConversation)
  deleteConversation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.deleteConversation, async ({ params }) => {
      await this.tutor.deleteConversation(user, params.conversationId);
      return { status: 204, body: undefined };
    });
  }

  @RequirePermission('student:trajectory.view')
  @TsRestHandler(aiContract.getTrajectory)
  getTrajectory(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.getTrajectory, async () => ({
      status: 200,
      body: await this.trajectory.get(user),
    }));
  }

  @RequirePermission('student:trajectory.view')
  @TsRestHandler(aiContract.refreshTrajectory)
  refreshTrajectory(@CurrentUser() user: AuthUser) {
    return tsRestHandler(aiContract.refreshTrajectory, async () => ({
      status: 202,
      body: await this.trajectory.refresh(user),
    }));
  }
}
