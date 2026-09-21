/** Семья: дети родителя, привязка по коду, кружки ребёнка. */
import {
  ChildClubsListSchema,
  ChildrenListSchema,
  LinkChildBodySchema,
  LinkChildResultSchema,
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
} from '../demo';
import { apiError, apiUrl, authed, json, noContent, readBody } from '../lib';
import { db, parentOfUser } from '../state';
import { paidUntilOf } from './payments';

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
