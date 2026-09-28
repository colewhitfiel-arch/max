/**
 * Семья: дети родителя, их кружки и приглашения по ссылке. Владелец — B8.
 * docs/05-api-contracts.md §5.3 `family.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateOnlySchema, DateTimeSchema, IdSchema, MoneySchema } from '../common';
import { LinkStatusSchema } from '../enums';
import {
  ChildBriefSchema,
  ClubProgressSchema,
  GroupBriefSchema,
  ScheduleRuleDtoSchema,
  StudentBriefSchema,
  UserBriefSchema,
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

/** Срок действия ссылки-приглашения ребёнка, в днях. */
export const CHILD_INVITE_TTL_DAYS = 7;

/**
 * Полезная нагрузка диплинка мини-приложения MAX для приглашения ребёнка:
 * `https://max.ru/<бот>?startapp=invite_<token>`. MAX допускает в `startapp` латиницу, цифры,
 * `_` и `-` до 512 символов — токен (base64url, 32 символа) подходит без кодирования.
 */
export const CHILD_INVITE_START_PARAM_PREFIX = 'invite_';

/** Токен приглашения: base64url без `=`. Короче 16 символов сервер не выдаёт. */
const CHILD_INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;

/** `startapp` диплинка MAX для приглашения с этим токеном. */
export function childInviteStartParam(token: string): string {
  return `${CHILD_INVITE_START_PARAM_PREFIX}${token}`;
}

/** Токен приглашения из `startapp` диплинка MAX; null — это не приглашение или мусор. */
export function parseChildInviteStartParam(startParam: string | null | undefined): string | null {
  if (!startParam?.startsWith(CHILD_INVITE_START_PARAM_PREFIX)) return null;
  const token = startParam.slice(CHILD_INVITE_START_PARAM_PREFIX.length);
  return CHILD_INVITE_TOKEN_RE.test(token) ? token : null;
}

/**
 * Ссылка-приглашение, которую родитель отправляет ребёнку в MAX. `url` строит сервер: если
 * задано имя бота (`MAX_BOT_NAME`) — диплинк мини-приложения
 * `https://max.ru/<бот>?startapp=invite_<token>`, иначе веб-адрес `${WEB_URL}/invite/<token>`.
 */
export const ChildInviteSchema = z.object({
  token: z.string().min(16),
  url: z.string().url(),
  expiresAt: DateTimeSchema,
});
export type ChildInvite = z.infer<typeof ChildInviteSchema>;

export const PARENT_INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED'] as const;
export const ParentInviteStatusSchema = z.enum(PARENT_INVITE_STATUSES);
export type ParentInviteStatus = z.infer<typeof ParentInviteStatusSchema>;

/** Приглашение глазами ученика, открывшего ссылку. */
export const ParentInviteSchema = z.object({
  token: z.string(),
  parent: UserBriefSchema,
  expiresAt: DateTimeSchema,
  status: ParentInviteStatusSchema,
  /** Ученик уже привязан к этому родителю (связь ACTIVE): принимать нечего, ответ будет 409. */
  alreadyLinked: z.boolean().optional(),
});
export type ParentInvite = z.infer<typeof ParentInviteSchema>;

export const AcceptParentInviteResultSchema = z.object({
  parent: UserBriefSchema,
  linkStatus: LinkStatusSchema,
});
export type AcceptParentInviteResult = z.infer<typeof AcceptParentInviteResultSchema>;

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
    createChildInvite: {
      method: 'POST',
      path: '/parent/children/invites',
      body: c.noBody(),
      responses: { 200: ChildInviteSchema },
      summary: 'Создать ссылку-приглашение для ребёнка (действует 7 дней)',
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
    getParentInvite: {
      method: 'GET',
      path: '/student/parent-invites/:token',
      pathParams: z.object({ token: z.string().min(1) }),
      responses: { 200: ParentInviteSchema },
      summary: 'Приглашение родителя по токену из ссылки',
      metadata: userRoute('student:parents.link'),
    },
    acceptParentInvite: {
      method: 'POST',
      path: '/student/parent-invites/:token/accept',
      pathParams: z.object({ token: z.string().min(1) }),
      body: c.noBody(),
      responses: { 200: AcceptParentInviteResultSchema },
      summary: 'Принять приглашение: связь с родителем становится ACTIVE',
      metadata: userRoute('student:parents.link'),
    },
  },
  contractRouterOptions,
);
