/**
 * Обращения в поддержку. Владелец — B9.
 * docs/05-api-contracts.md §5.3 `support.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema } from '../common';
import { SupportTicketSchema } from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const SupportTicketBriefSchema = SupportTicketSchema.omit({ message: true });
export type SupportTicketBrief = z.infer<typeof SupportTicketBriefSchema>;

export const SupportTicketsListSchema = z.object({ items: z.array(SupportTicketBriefSchema) });
export type SupportTicketsList = z.infer<typeof SupportTicketsListSchema>;

export const CreateTicketResultSchema = z.object({ id: IdSchema });
export type CreateTicketResult = z.infer<typeof CreateTicketResultSchema>;

// ---------- Тела запросов ----------

export const CreateTicketBodySchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});
export type CreateTicketBody = z.infer<typeof CreateTicketBodySchema>;

// ---------- Роуты ----------

export const supportContract = c.router(
  {
    createTicket: {
      method: 'POST',
      path: '/support/tickets',
      body: CreateTicketBodySchema,
      responses: { 200: CreateTicketResultSchema },
      summary: 'Создать обращение в поддержку',
      metadata: userRoute('common:support.create'),
    },
    listTickets: {
      method: 'GET',
      path: '/support/tickets',
      responses: { 200: SupportTicketsListSchema },
      summary: 'Обращения пользователя',
      metadata: userRoute('common:support.create'),
    },
  },
  contractRouterOptions,
);
