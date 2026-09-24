/**
 * ИИ-слой: онбординг, чат-тьютор (ученика и родителя), траектория. Владелец — B10 (секции A1/A2/A4).
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
  /** Направления, которые ученик хотел бы попробовать позже (не сейчас): спрос на будущее. */
  futureInterests: z.array(z.string()).default([]),
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

/** Отношение ученика к кружку по итогам онбординга — enum живёт в `enums.ts`, здесь реэкспорт. */
export { ClubInterestStatusSchema, type ClubInterestStatus } from '../enums';

/** Спрос на кружок: сколько учеников записалось, хотят позже, и кому он был показан. */
export const ClubDemandSchema = z.object({
  club: ClubCardSchema,
  chosen: z.number().int().nonnegative(),
  later: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Средняя релевантность по оценке ИИ среди всех, кому показывали, 0..1 (null — никому не показывали). */
  avgScore: z.number().min(0).max(1).nullable(),
  /** Типичные причины интереса — до трёх формулировок из рекомендаций. */
  reasons: z.array(z.string()),
});
export type ClubDemand = z.infer<typeof ClubDemandSchema>;

export const ClubDemandReportSchema = z.object({
  /** Сколько учеников школы прошли онбординг. */
  students: z.number().int().nonnegative(),
  /** Направления «на будущее» из профилей: текст → сколько учеников назвали. */
  futureInterests: z.array(z.object({ label: z.string(), count: z.number().int().positive() })),
  items: z.array(ClubDemandSchema),
});
export type ClubDemandReport = z.infer<typeof ClubDemandReportSchema>;

export const TrajectoryRefreshResultSchema = z.object({ queued: z.literal(true) });
export type TrajectoryRefreshResult = z.infer<typeof TrajectoryRefreshResultSchema>;

// ---------- Query и тела запросов ----------

export const CompleteOnboardingBodySchema = z.object({
  /** Записаться сейчас. */
  selectedClubIds: z.array(IdSchema),
  /** Отметил «хочу попробовать позже» — запись не создаётся, фиксируется как спрос. */
  laterClubIds: z.array(IdSchema).default([]),
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
    getClubDemand: {
      method: 'GET',
      path: '/teacher/clubs/demand',
      responses: { 200: ClubDemandReportSchema },
      summary: 'Спрос на кружки школы по итогам онбординга: записались / хотят позже / пропустили',
      metadata: userRoute('teacher:students.view'),
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
      /**
       * Лента с конца: первая страница — последние сообщения (внутри страницы — по возрастанию
       * времени), `nextCursor` ведёт к более старым.
       */
      summary:
        'История сообщений диалога: первая страница — последние сообщения (внутри — по возрастанию времени), nextCursor ведёт к более старым',
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
    listParentConversations: {
      method: 'GET',
      path: '/parent/children/:studentId/ai/conversations',
      pathParams: z.object({ studentId: IdSchema }),
      query: PaginationQuerySchema,
      responses: { 200: paginated(ConversationDtoSchema) },
      summary: 'Диалоги родителя с тьютором о ребёнке',
      metadata: userRoute('parent:tutor.chat'),
    },
    createParentConversation: {
      method: 'POST',
      path: '/parent/children/:studentId/ai/conversations',
      pathParams: z.object({ studentId: IdSchema }),
      body: c.noBody(),
      responses: { 200: ConversationDtoSchema },
      summary: 'Создать диалог родителя с тьютором о ребёнке (kind TUTOR)',
      metadata: userRoute('parent:tutor.chat'),
    },
    listParentConversationMessages: {
      method: 'GET',
      path: '/parent/ai/conversations/:conversationId/messages',
      pathParams: z.object({ conversationId: IdSchema }),
      query: PaginationQuerySchema,
      responses: { 200: paginated(AiMessageDtoSchema) },
      /** Пагинация — как у `listConversationMessages`: с конца, `nextCursor` — к более старым. */
      summary:
        'История сообщений диалога родителя: первая страница — последние сообщения (внутри — по возрастанию времени), nextCursor ведёт к более старым',
      metadata: userRoute('parent:tutor.chat'),
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
