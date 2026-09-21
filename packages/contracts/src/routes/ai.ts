/**
 * ИИ-слой: онбординг, чат-тьютор, траектория. Владелец — B10 (секции A1/A2/A4).
 * docs/05-api-contracts.md §5.3 `ai.ts`. Стриминговые ручки (SSE) — в `streaming.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema, PaginationQuerySchema, paginated } from '../common';
import { ConversationKindSchema } from '../enums';
import { AiConversationSchema, AiMessageSchema, TrajectorySchema } from '../entities';
import { MeDtoSchema } from './auth';
import { ClubCardSchema } from './catalog';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

/** Черновик профиля ученика, собранный ИИ в онбординге. */
export const OnboardingProfileDraftSchema = z.object({
  interests: z.array(z.string()),
  goals: z.array(z.string()),
  weeklyHours: z.number().int().nonnegative(),
  preferredFormats: z.array(z.string()),
  summary: z.string(),
});
export type OnboardingProfileDraft = z.infer<typeof OnboardingProfileDraftSchema>;

export const AiMessageDtoSchema = AiMessageSchema;
export type AiMessageDto = z.infer<typeof AiMessageDtoSchema>;

export const ConversationDtoSchema = AiConversationSchema.pick({
  id: true,
  kind: true,
  title: true,
  lastMessageAt: true,
});
export type ConversationDto = z.infer<typeof ConversationDtoSchema>;

export const TrajectoryDtoSchema = TrajectorySchema;
export type TrajectoryDto = z.infer<typeof TrajectoryDtoSchema>;

export const OnboardingStartResultSchema = z.object({
  conversationId: IdSchema,
  /** Первое сообщение ассистента. */
  message: AiMessageDtoSchema,
});
export type OnboardingStartResult = z.infer<typeof OnboardingStartResultSchema>;

export const ClubRecommendationSchema = z.object({
  club: ClubCardSchema,
  reason: z.string(),
  /** Релевантность 0..1. */
  score: z.number().min(0).max(1),
});
export type ClubRecommendation = z.infer<typeof ClubRecommendationSchema>;

export const OnboardingRecommendationsSchema = z.object({
  items: z.array(ClubRecommendationSchema),
});
export type OnboardingRecommendations = z.infer<typeof OnboardingRecommendationsSchema>;

export const TrajectoryRefreshResultSchema = z.object({ queued: z.literal(true) });
export type TrajectoryRefreshResult = z.infer<typeof TrajectoryRefreshResultSchema>;

// ---------- Query и тела запросов ----------

export const CompleteOnboardingBodySchema = z.object({
  selectedClubIds: z.array(IdSchema),
  profileDraft: OnboardingProfileDraftSchema,
});
export type CompleteOnboardingBody = z.infer<typeof CompleteOnboardingBodySchema>;

export const ListConversationsQuerySchema = PaginationQuerySchema.extend({
  kind: ConversationKindSchema.optional(),
});
export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;

export const CreateConversationBodySchema = z.object({
  kind: z.literal('TUTOR'),
});
export type CreateConversationBody = z.infer<typeof CreateConversationBodySchema>;

// ---------- Роуты ----------

export const aiContract = c.router(
  {
    startOnboarding: {
      method: 'POST',
      path: '/student/onboarding/start',
      body: c.noBody(),
      responses: { 200: OnboardingStartResultSchema },
      summary: 'Начать диалог онбординга',
      metadata: userRoute('student:onboarding.complete'),
    },
    getOnboardingRecommendations: {
      method: 'GET',
      path: '/student/onboarding/recommendations',
      responses: { 200: OnboardingRecommendationsSchema },
      summary: 'Рекомендованные кружки после завершения диалога',
      metadata: userRoute('student:onboarding.complete'),
    },
    completeOnboarding: {
      method: 'POST',
      path: '/student/onboarding/complete',
      body: CompleteOnboardingBodySchema,
      responses: { 200: MeDtoSchema },
      summary: 'Завершить онбординг: сохранить профиль и записаться в кружки',
      metadata: userRoute('student:onboarding.complete'),
    },
    listConversations: {
      method: 'GET',
      path: '/ai/conversations',
      query: ListConversationsQuerySchema,
      responses: { 200: paginated(ConversationDtoSchema) },
      summary: 'Диалоги пользователя с ИИ',
      metadata: userRoute('student:tutor.chat'),
    },
    createConversation: {
      method: 'POST',
      path: '/ai/conversations',
      body: CreateConversationBodySchema,
      responses: { 200: ConversationDtoSchema },
      summary: 'Создать диалог с тьютором',
      metadata: userRoute('student:tutor.chat'),
    },
    listConversationMessages: {
      method: 'GET',
      path: '/ai/conversations/:conversationId/messages',
      pathParams: z.object({ conversationId: IdSchema }),
      query: PaginationQuerySchema,
      responses: { 200: paginated(AiMessageDtoSchema) },
      summary: 'История сообщений диалога',
      metadata: userRoute('student:tutor.chat'),
    },
    deleteConversation: {
      method: 'DELETE',
      path: '/ai/conversations/:conversationId',
      pathParams: z.object({ conversationId: IdSchema }),
      body: c.noBody(),
      responses: { 204: c.noBody() },
      summary: 'Удалить диалог',
      metadata: userRoute('student:tutor.chat'),
    },
    getTrajectory: {
      method: 'GET',
      path: '/student/trajectory',
      responses: { 200: TrajectoryDtoSchema.nullable() },
      summary: 'Образовательная траектория ученика (null, если ещё не построена)',
      metadata: userRoute('student:trajectory.view'),
    },
    refreshTrajectory: {
      method: 'POST',
      path: '/student/trajectory/refresh',
      body: c.noBody(),
      responses: { 202: TrajectoryRefreshResultSchema },
      summary: 'Поставить пересчёт траектории в очередь (1 раз в сутки)',
      metadata: userRoute('student:trajectory.view'),
    },
  },
  contractRouterOptions,
);
