/**
 * Каталог кружков и публичные профили преподавателей. Владелец — B2.
 * docs/05-api-contracts.md §5.3 `catalog.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema, MoneySchema, PaginationQuerySchema, paginated } from '../common';
import { BillingPeriodSchema, ClubCategorySchema } from '../enums';
import {
  ClubBriefSchema,
  ScheduleRuleDtoSchema,
  TeacherBriefSchema,
  TeacherContactsSchema,
} from '../entities';
import { contractRouterOptions, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

/** Карточка кружка в каталоге. */
export const ClubCardSchema = ClubBriefSchema.extend({
  description: z.string(),
  price: MoneySchema,
  billingPeriod: BillingPeriodSchema,
  tags: z.array(z.string()),
  teachers: z.array(TeacherBriefSchema),
  /** Человекочитаемое расписание, например «Пн 16:00–17:30». */
  schedulePreview: z.array(z.string()),
});
export type ClubCard = z.infer<typeof ClubCardSchema>;

export const ClubGroupSchema = z.object({
  id: IdSchema,
  title: z.string(),
  teacher: TeacherBriefSchema,
  schedule: z.array(ScheduleRuleDtoSchema),
});
export type ClubGroup = z.infer<typeof ClubGroupSchema>;

export const ClubDetailSchema = ClubCardSchema.extend({
  groups: z.array(ClubGroupSchema),
});
export type ClubDetail = z.infer<typeof ClubDetailSchema>;

/** Публичный профиль преподавателя; contacts — только по политике школы, иначе null. */
export const TeacherPublicProfileSchema = TeacherBriefSchema.extend({
  qualification: z.string().nullable(),
  bio: z.string().nullable(),
  /** Кружки, которые преподаватель ведёт (выбрал сам); `clubs` — где он ведёт группы сейчас. */
  subjects: z.array(ClubCategorySchema),
  clubs: z.array(ClubBriefSchema),
  contacts: TeacherContactsSchema.nullable(),
});
export type TeacherPublicProfile = z.infer<typeof TeacherPublicProfileSchema>;

// ---------- Query ----------

export const ListClubsQuerySchema = PaginationQuerySchema.extend({
  category: ClubCategorySchema.optional(),
});
export type ListClubsQuery = z.infer<typeof ListClubsQuerySchema>;

// ---------- Роуты ----------

export const catalogContract = c.router(
  {
    listClubs: {
      method: 'GET',
      path: '/catalog/clubs',
      query: ListClubsQuerySchema,
      responses: { 200: paginated(ClubCardSchema) },
      summary: 'Каталог кружков с фильтром по категории',
      metadata: userRoute(),
    },
    getClub: {
      method: 'GET',
      path: '/catalog/clubs/:clubId',
      pathParams: z.object({ clubId: IdSchema }),
      responses: { 200: ClubDetailSchema },
      summary: 'Кружок с группами и расписанием',
      metadata: userRoute(),
    },
    getTeacherPublicProfile: {
      method: 'GET',
      path: '/teachers/:teacherId',
      pathParams: z.object({ teacherId: IdSchema }),
      responses: { 200: TeacherPublicProfileSchema },
      summary: 'Публичный профиль преподавателя',
      metadata: userRoute(),
    },
  },
  contractRouterOptions,
);
