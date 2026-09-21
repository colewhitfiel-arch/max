/**
 * Семья: дети родителя и их кружки. Владелец — B8.
 * docs/05-api-contracts.md §5.3 `family.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateOnlySchema, IdSchema, MoneySchema } from '../common';
import { LinkStatusSchema } from '../enums';
import {
  ChildBriefSchema,
  ClubProgressSchema,
  GroupBriefSchema,
  ScheduleRuleDtoSchema,
  StudentBriefSchema,
} from '../entities';
import { ClubCardSchema } from './catalog';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const ChildrenListSchema = z.object({ items: z.array(ChildBriefSchema) });
export type ChildrenList = z.infer<typeof ChildrenListSchema>;

export const LinkChildResultSchema = z.object({
  student: StudentBriefSchema,
  linkStatus: LinkStatusSchema,
});
export type LinkChildResult = z.infer<typeof LinkChildResultSchema>;

/** Кружок ребёнка с оплатой: paidUntil null — оплат ещё не было. */
export const ChildClubSchema = z.object({
  club: ClubCardSchema,
  group: GroupBriefSchema,
  enrollmentId: IdSchema,
  schedule: z.array(ScheduleRuleDtoSchema),
  progress: ClubProgressSchema,
  paidUntil: DateOnlySchema.nullable(),
  nextPaymentAt: DateOnlySchema,
  price: MoneySchema,
});
export type ChildClub = z.infer<typeof ChildClubSchema>;

export const ChildClubsListSchema = z.object({ items: z.array(ChildClubSchema) });
export type ChildClubsList = z.infer<typeof ChildClubsListSchema>;

// ---------- Тела запросов ----------

export const LinkChildBodySchema = z.object({
  /** StudentProfile.linkCode, который ученик показывает родителю. */
  code: z.string().min(1),
});
export type LinkChildBody = z.infer<typeof LinkChildBodySchema>;

// ---------- Роуты ----------

export const familyContract = c.router(
  {
    listChildren: {
      method: 'GET',
      path: '/parent/children',
      responses: { 200: ChildrenListSchema },
      summary: 'Дети родителя со статусом привязки',
      metadata: userRoute('parent:children.manage'),
    },
    linkChild: {
      method: 'POST',
      path: '/parent/children/link',
      body: LinkChildBodySchema,
      responses: { 200: LinkChildResultSchema },
      summary: 'Привязать ребёнка по коду',
      metadata: userRoute('parent:children.manage'),
    },
    unlinkChild: {
      method: 'DELETE',
      path: '/parent/children/:studentId',
      pathParams: z.object({ studentId: IdSchema }),
      body: c.noBody(),
      responses: { 204: c.noBody() },
      summary: 'Отвязать ребёнка (связь → REVOKED)',
      metadata: userRoute('parent:children.manage'),
    },
    listChildClubs: {
      method: 'GET',
      path: '/parent/children/:studentId/clubs',
      pathParams: z.object({ studentId: IdSchema }),
      responses: { 200: ChildClubsListSchema },
      summary: 'Кружки ребёнка с расписанием, прогрессом и оплатой',
      metadata: userRoute('parent:child.clubs.view'),
    },
  },
  contractRouterOptions,
);
