import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import {
  IdSchema,
  type OnboardingMessageBody,
  OnboardingMessageBodySchema,
  type TutorMessageBody,
  TutorMessageBodySchema,
} from '@edu/contracts';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AppLogger } from '../../common/logger/logger.service';
import { RateLimit } from '../../common/rate-limit/rate-limit';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { OnboardingService } from './onboarding.service';
import { ParentTutorService } from './parent-tutor.service';
import { createSseSink, type SseSink } from './sse';
import { TutorService } from './tutor.service';

/** Ответ оборвался после начала стрима (ученику — на «ты», родителю — на «вы»). */
const STUDENT_FAILED = 'Не удалось закончить ответ — отправь сообщение ещё раз';
const PARENT_FAILED = 'Не удалось закончить ответ — отправьте сообщение ещё раз';

/**
 * Стриминговые ручки (`STREAMING_ROUTES` контракта): `text/event-stream` с событиями
 * token / done / error. Ошибки до первого события — обычный JSON ApiError; после — событие
 * `error` в потоке и закрытие соединения.
 */
@Controller()
export class AiStreamController {
  private readonly log;

  constructor(
    private readonly tutor: TutorService,
    private readonly parentTutor: ParentTutorService,
    private readonly onboarding: OnboardingService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'ai.stream' });
  }

  /**
   * Ход со стримом. До первого события ошибка уходит в ApiExceptionFilter (JSON). Поток уже
   * открыт — фильтр ответить не может (заголовки отправлены), поэтому здесь: событие `error`
   * и конец ответа, иначе клиент ждал бы `done` до таймаута. Текст сообщений в лог не пишем.
   */
  private async stream(
    sink: SseSink,
    turn: { route: string; conversationId: string; failedMessage: string },
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (!sink.opened) throw error;
      const { route, conversationId } = turn;
      this.log.error({ err: error, route, conversationId }, 'сбой посреди SSE-ответа');
      sink.write({ type: 'error', code: 'INTERNAL', message: turn.failedMessage });
    }
    sink.end();
  }

  @RequirePermission('student:onboarding.complete')
  @RateLimit('ai')
  @Post('student/onboarding/messages')
  async onboardingMessage(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(OnboardingMessageBodySchema)) body: OnboardingMessageBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = createSseSink(req, res);
    const turn = {
      route: 'onboarding',
      conversationId: body.conversationId,
      failedMessage: STUDENT_FAILED,
    };
    await this.stream(sink, turn, () =>
      this.onboarding.message(user, body.conversationId, body.text, sink),
    );
  }

  @RequirePermission('student:tutor.chat')
  @RateLimit('ai')
  @Post('ai/conversations/:conversationId/messages')
  async tutorMessage(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', new ZodValidationPipe(IdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(TutorMessageBodySchema)) body: TutorMessageBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = createSseSink(req, res);
    const turn = { route: 'tutor', conversationId, failedMessage: STUDENT_FAILED };
    await this.stream(sink, turn, () => this.tutor.reply(user, conversationId, body.text, sink));
  }

  /** Тьютор родителя о ребёнке (`STREAMING_ROUTES.parentTutorMessage`). */
  @RequirePermission('parent:tutor.chat')
  @RateLimit('ai')
  @Post('parent/ai/conversations/:conversationId/messages')
  async parentTutorMessage(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', new ZodValidationPipe(IdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(TutorMessageBodySchema)) body: TutorMessageBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sink = createSseSink(req, res);
    const turn = { route: 'parentTutor', conversationId, failedMessage: PARENT_FAILED };
    await this.stream(sink, turn, () =>
      this.parentTutor.reply(user, conversationId, body.text, sink),
    );
  }
}
