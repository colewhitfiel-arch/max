import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import {
  type OnboardingMessageBody,
  OnboardingMessageBodySchema,
  type TutorMessageBody,
  TutorMessageBodySchema,
} from '@edu/contracts';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { OnboardingService } from './onboarding.service';
import { createSseSink } from './sse';
import { TutorService } from './tutor.service';

/**
 * Стриминговые ручки (`STREAMING_ROUTES` контракта): `text/event-stream` с событиями
 * token / done / error. Ошибки до первого события — обычный JSON ApiError.
 */
@Controller()
export class AiStreamController {
  constructor(
    private readonly tutor: TutorService,
    private readonly onboarding: OnboardingService,
  ) {}

  @RequirePermission('student:onboarding.complete')
  @Post('student/onboarding/messages')
  async onboardingMessage(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(OnboardingMessageBodySchema)) body: OnboardingMessageBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = createSseSink(req, res);
    await this.onboarding.message(user, body.conversationId, body.text, sink);
    sink.end();
  }

  @RequirePermission('student:tutor.chat')
  @Post('ai/conversations/:conversationId/messages')
  async tutorMessage(
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(TutorMessageBodySchema)) body: TutorMessageBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = createSseSink(req, res);
    await this.tutor.reply(user, conversationId, body.text, sink);
    sink.end();
  }
}
