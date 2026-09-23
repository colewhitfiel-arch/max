/** Семья: дети родителя, привязка по коду и по ссылке-приглашению (docs/07 F14), кружки ребёнка. */
import {
  AcceptParentInviteResultSchema,
  CHILD_INVITE_TTL_DAYS,
  ChildClubsListSchema,
  ChildInviteSchema,
  ChildrenListSchema,
  LinkChildBodySchema,
  LinkChildResultSchema,
  type ParentInviteStatus,
  ParentInviteSchema,
} from '@edu/contracts';
import { demoSchool } from '@edu/contracts/fixtures';
import { http } from 'msw';
import {
  childrenIdsOfParent,
  clubCard,
  clubProgress,
  enrollmentsOfStudent,
  groupBrief,
  scheduleOfGroup,
  studentBrief,
  userBrief,
} from '../demo';
import { apiError, apiUrl, authed, json, noContent, readBody } from '../lib';
import { db, parentOfUser, studentOfUser } from '../state';
import type { MockInvite } from '../world-extras';
import { paidUntilOf } from './payments';

const DAY_MS = 86_400_000;

/** Связь родитель ↔ ребёнок → ACTIVE (создать или восстановить), как при привязке по коду. */
function activateLink(parentId: string, studentId: string): void {
  const now = new Date().toISOString();
  const existing = db.links.find((l) => l.parentId === parentId && l.studentId === studentId);
  if (existing) {
    if (existing.status !== 'ACTIVE') {
      existing.status = 'ACTIVE';
      existing.confirmedAt = now;
    }
    return;
  }
  db.links.push({ parentId, studentId, status: 'ACTIVE', requestedAt: now, confirmedAt: now });
}

/**
 * Ссылка на экран `/invite/:token` мини-аппа. Формат deep link MAX — TODO (workstream J);
 * в Node-тестах `location` нет — берём http://localhost.
 */
function inviteUrl(token: string): string {
  const origin =
    typeof location !== 'undefined' && location.origin && location.origin !== 'null'
      ? location.origin
      : 'http://localhost';
  return `${origin}/invite/${token}`;
}

function inviteStatus(invite: MockInvite, now = Date.now()): ParentInviteStatus {
  if (invite.acceptedAt) return 'ACCEPTED';
  return new Date(invite.expiresAt).getTime() < now ? 'EXPIRED' : 'PENDING';
}

const parentUserIdOf = (parentId: string) => db.parents.find((p) => p.id === parentId)?.userId;

const isLinked = (parentId: string, studentId: string) =>
  db.links.some(
    (l) => l.parentId === parentId && l.studentId === studentId && l.status === 'ACTIVE',
  );

export const familyHandlers = [
  http.get(
    apiUrl('/parent/children'),
    authed(
      ({ auth }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent) return apiError('FORBIDDEN', 'Нет профиля родителя');
        const items = db.links
          .filter((l) => l.parentId === parent.id && l.status !== 'REVOKED')
          .map((l) => {
            const profile = db.students.find((s) => s.id === l.studentId)!;
            return {
              student: studentBrief(l.studentId),
              linkStatus: l.status,
              school: profile.schoolId ? { id: demoSchool.id, name: demoSchool.name } : null,
            };
          });
        return json(ChildrenListSchema, { items });
      },
      ['PARENT'],
    ),
  ),

  http.post(
    apiUrl('/parent/children/link'),
    authed(
      async ({ auth, request }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent) return apiError('FORBIDDEN', 'Нет профиля родителя');
        const body = await readBody(request, LinkChildBodySchema);
        if (!body.ok) return body.response;
        const student = db.students.find(
          (s) => s.linkCode.toUpperCase() === body.data.code.toUpperCase(),
        );
        if (!student) return apiError('NOT_FOUND', 'Код не найден. Проверь код в профиле ребёнка');
        const existing = db.links.find(
          (l) => l.parentId === parent.id && l.studentId === student.id,
        );
        if (existing?.status === 'ACTIVE') return apiError('CONFLICT', 'Ребёнок уже привязан');
        const now = new Date().toISOString();
        if (existing) {
          existing.status = 'ACTIVE';
          existing.confirmedAt = now;
        } else {
          db.links.push({
            parentId: parent.id,
            studentId: student.id,
            status: 'ACTIVE',
            requestedAt: now,
            confirmedAt: now,
          });
        }
        return json(LinkChildResultSchema, {
          student: studentBrief(student.id),
          linkStatus: 'ACTIVE',
        });
      },
      ['PARENT'],
    ),
  ),

  http.post(
    apiUrl('/parent/children/invites'),
    authed(
      ({ auth }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent) return apiError('FORBIDDEN', 'Нет профиля родителя');
        const now = Date.now();
        const invite: MockInvite = {
          token: crypto.randomUUID().replace(/-/g, ''),
          parentId: parent.id,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHILD_INVITE_TTL_DAYS * DAY_MS).toISOString(),
          acceptedByStudentId: null,
          acceptedAt: null,
        };
        db.invites.push(invite);
        return json(ChildInviteSchema, {
          token: invite.token,
          url: inviteUrl(invite.token),
          expiresAt: invite.expiresAt,
        });
      },
      ['PARENT'],
    ),
  ),

  http.get<{ token: string }>(
    apiUrl('/student/parent-invites/:token'),
    authed(
      ({ params }) => {
        const invite = db.invites.find((i) => i.token === params.token);
        const parentUserId = invite && parentUserIdOf(invite.parentId);
        if (!invite || !parentUserId) return apiError('NOT_FOUND', 'Приглашение не найдено');
        return json(ParentInviteSchema, {
          token: invite.token,
          parent: userBrief(parentUserId),
          expiresAt: invite.expiresAt,
          status: inviteStatus(invite),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ token: string }>(
    apiUrl('/student/parent-invites/:token/accept'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const invite = db.invites.find((i) => i.token === params.token);
        const parentUserId = invite && parentUserIdOf(invite.parentId);
        if (!invite || !parentUserId) return apiError('NOT_FOUND', 'Приглашение не найдено');
        const status = inviteStatus(invite);
        if (status === 'ACCEPTED') {
          // Чужое принятое — конфликт. Повтор тем же ребёнком идемпотентен, только пока связь
          // жива: принятая ссылка не восстанавливает связь, которую родитель отвязал.
          if (invite.acceptedByStudentId !== student.id) {
            return apiError('CONFLICT', 'Приглашение уже принято');
          }
          if (!isLinked(invite.parentId, student.id)) {
            return apiError('BUSINESS_RULE', 'Приглашение уже использовано');
          }
        } else if (status === 'EXPIRED') {
          return apiError('BUSINESS_RULE', 'Срок действия приглашения истёк');
        } else if (parentUserId === auth.user.id) {
          return apiError('BUSINESS_RULE', 'Нельзя принять собственное приглашение');
        } else if (isLinked(invite.parentId, student.id)) {
          // Уже привязан — ссылку не тратим (как CONFLICT у привязки по коду).
          return apiError('CONFLICT', 'Ты уже привязан к этому родителю');
        } else {
          invite.acceptedByStudentId = student.id;
          invite.acceptedAt = new Date().toISOString();
          activateLink(invite.parentId, student.id);
        }
        return json(AcceptParentInviteResultSchema, {
          parent: userBrief(parentUserId),
          linkStatus: 'ACTIVE',
        });
      },
      ['STUDENT'],
    ),
  ),

  http.delete<{ studentId: string }>(
    apiUrl('/parent/children/:studentId'),
    authed(
      ({ auth, params }) => {
        const parent = parentOfUser(auth.user.id);
        const link =
          parent &&
          db.links.find((l) => l.parentId === parent.id && l.studentId === params.studentId);
        if (!link) return apiError('NOT_FOUND', 'Связь не найдена');
        link.status = 'REVOKED';
        return noContent();
      },
      ['PARENT'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/clubs'),
    authed(
      ({ auth, params }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent || !childrenIdsOfParent(parent.id).includes(params.studentId)) {
          return apiError('FORBIDDEN', 'Ребёнок не привязан');
        }
        const items = enrollmentsOfStudent(params.studentId).map((enrollment) => {
          const group = groupBrief(enrollment.groupId);
          const club = db.clubs.find((c) => c.id === group.club.id)!;
          const paid = paidUntilOf(enrollment.id);
          return {
            club: clubCard(club.id),
            group,
            enrollmentId: enrollment.id,
            schedule: scheduleOfGroup(group.id),
            progress: clubProgress(params.studentId, group.id),
            paidUntil: paid.paidUntil,
            nextPaymentAt: paid.nextPaymentAt,
            price: club.price,
          };
        });
        return json(ChildClubsListSchema, { items });
      },
      ['PARENT'],
    ),
  ),
];
