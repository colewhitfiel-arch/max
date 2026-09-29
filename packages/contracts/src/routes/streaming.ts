/**
 * Стриминговые (SSE, `text/event-stream`) ручки ИИ. ts-rest не типизирует SSE, поэтому они
 * не входят в `apiContract`: здесь константы путей, схемы тел и событий. Реализуются обычным
 * Nest-контроллером; путь так же под `API_PREFIX`.
 */
import { z } from 'zod';
import { IdSchema } from '../common';
import { OnboardingProfileDraftSchema } from './ai';
import { ClubCardSchema } from './catalog';
import { type RouteMeta, userRoute } from './meta';

export { AiStreamEventSchema, type AiStreamEvent } from '../entities';

export const STREAMING_ROUTES = {
  /** Сообщение в диалог онбординга; done-событие может содержать profileDraft. */
  onboardingMessage: {
    method: 'POST',
    path: '/student/onboarding/messages',
    metadata: userRoute('student:onboarding.complete') as RouteMeta,
  },
  /** Сообщение тьютору; rate limit — AI_TUTOR_DAILY_LIMIT (429). */
  tutorMessage: {
    method: 'POST',
    path: (conversationId: string) => `/ai/conversations/${conversationId}/messages`,
    metadata: userRoute('student:tutor.chat') as RouteMeta,
  },
  /**
   * Сообщение тьютору родителя о ребёнке: тело `TutorMessageBody`, события `AiStreamEvent`;
   * лимит тот же (AI_TUTOR_DAILY_LIMIT, 429).
   */
  parentTutorMessage: {
    method: 'POST',
    path: (conversationId: string) => `/parent/ai/conversations/${conversationId}/messages`,
    metadata: userRoute('parent:tutor.chat') as RouteMeta,
  },
} as const;

export const OnboardingMessageBodySchema = z.object({
  conversationId: IdSchema,
  text: z.string().min(1),
});
export type OnboardingMessageBody = z.infer<typeof OnboardingMessageBodySchema>;

export const TutorMessageBodySchema = z.object({
  text: z.string().min(1),
});
export type TutorMessageBody = z.infer<typeof TutorMessageBodySchema>;

/** События стрима онбординга: как общий стрим, но `done` типизирует profileDraft. */
export const OnboardingStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    messageId: IdSchema,
    /** true — профиль собран, можно запрашивать рекомендации. */
    isComplete: z.boolean(),
    profileDraft: OnboardingProfileDraftSchema.optional(),
    /**
     * Кружки, которые тьютор предложил в этой реплике: клиент показывает их кнопками, ученик
     * выбирает кружок одним нажатием, без ввода названия. Только кружки школы ученика.
     */
    clubOptions: z.array(ClubCardSchema).optional(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type OnboardingStreamEvent = z.infer<typeof OnboardingStreamEventSchema>;
