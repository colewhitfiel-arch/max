/**
 * Свои группы преподавателя и вступление по ссылке (docs/07 F19): как на сервере — новая группа
 * создаётся с кружком в каталоге, ссылкой и занятиями на 8 недель; ссылка многоразовая.
 */
import {
  CreateGroupBodySchema,
  CreatedGroupSchema,
  GroupInvitePreviewSchema,
  GroupInviteSchema,
  JoinGroupResultSchema,
  type Lesson,
} from '@edu/contracts';
import { http } from 'msw';
import { addDays, toDateOnly } from '@/shared/lib/dates';
import { groupBrief, groupsOfTeacher, scheduleOfGroup, studentIdsOfGroup } from '../demo';
import { apiError, apiUrl, authed, json, readBody } from '../lib';
import { db, type MockGroup, studentOfUser, teacherOfUser } from '../state';

/** Недель занятий, которые сразу получает новая группа (как `NEW_GROUP_LESSON_WEEKS` в api). */
const NEW_GROUP_LESSON_WEEKS = 8;

const newToken = () =>
  crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 10);

/** Ссылка на `/join/:token`; в Node-тестах `location` нет — берём http://localhost. */
function joinUrl(token: string): string {
  const origin =
    typeof location !== 'undefined' && location.origin && location.origin !== 'null'
      ? location.origin
      : 'http://localhost';
  return `${origin}/join/${token}`;
}

const inviteOf = (group: MockGroup) => {
  group.inviteToken ??= newToken();
  return { token: group.inviteToken, url: joinUrl(group.inviteToken) };
};

/** Своя группа преподавателя или ответ-ошибка. */
function ownGroup(userId: string, groupId: string): MockGroup | Response {
  const teacher = teacherOfUser(userId);
  if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
  const group = db.groups.find((g) => g.id === groupId);
  if (!group) return apiError('NOT_FOUND', 'Группа не найдена');
  if (!groupsOfTeacher(teacher.id).includes(group))
    return apiError('FORBIDDEN', 'Группа принадлежит другому преподавателю');
  return group;
}

/** Активная группа по токену ссылки (сброшенная ссылка и закрытая группа — не найдены). */
const groupByToken = (token: string) =>
  db.groups.find((g) => g.inviteToken === token && g.isActive) ?? null;

export const teacherGroupsHandlers = [
  http.post(
    apiUrl('/teacher/groups'),
    authed(
      async ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const body = await readBody(request, CreateGroupBodySchema);
        if (!body.ok) return body.response;
        const { category, title, description, price, schedule } = body.data;
        const clubId = crypto.randomUUID();
        db.clubs.push({
          id: clubId,
          schoolId: teacher.schoolId,
          title,
          description: description ?? '',
          category,
          coverUrl: null,
          price,
          billingPeriod: 'MONTH',
          isActive: true,
          tags: [],
        });
        const group: MockGroup = {
          id: crypto.randomUUID(),
          clubId,
          teacherId: teacher.id,
          title,
          isActive: true,
          code: null,
          inviteToken: newToken(),
        };
        db.groups.push(group);
        const today = toDateOnly(new Date());
        const now = Date.now();
        for (const rule of schedule) {
          const ruleId = crypto.randomUUID();
          db.scheduleRules.push({
            id: ruleId,
            groupId: group.id,
            weekday: rule.weekday,
            startTime: rule.startTime,
            endTime: rule.endTime,
            room: rule.room ?? null,
            validFrom: today,
            validTo: null,
          });
          // Занятия на 8 недель вперёд по часам браузера (моки живут в его поясе).
          for (let day = 0; day < NEW_GROUP_LESSON_WEEKS * 7; day += 1) {
            const date = addDays(new Date(), day);
            if (date.getDay() !== rule.weekday) continue;
            const at = (time: string) => {
              const [h, m] = time.split(':').map(Number);
              const moment = new Date(date);
              moment.setHours(h!, m!, 0, 0);
              return moment;
            };
            const startsAt = at(rule.startTime);
            if (startsAt.getTime() <= now) continue;
            const lesson: Lesson = {
              id: crypto.randomUUID(),
              groupId: group.id,
              ruleId,
              startsAt: startsAt.toISOString(),
              endsAt: at(rule.endTime).toISOString(),
              topic: null,
              room: rule.room ?? null,
              status: 'PLANNED',
              cancelReason: null,
            };
            db.lessons.push(lesson);
          }
        }
        return json(CreatedGroupSchema, { group: groupBrief(group.id), invite: inviteOf(group) });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ groupId: string }>(
    apiUrl('/teacher/groups/:groupId/invite'),
    authed(
      ({ auth, params }) => {
        const group = ownGroup(auth.user.id, params.groupId);
        if (group instanceof Response) return group;
        return json(GroupInviteSchema, inviteOf(group));
      },
      ['TEACHER'],
    ),
  ),

  http.post<{ groupId: string }>(
    apiUrl('/teacher/groups/:groupId/invite/reset'),
    authed(
      ({ auth, params }) => {
        const group = ownGroup(auth.user.id, params.groupId);
        if (group instanceof Response) return group;
        group.inviteToken = newToken();
        return json(GroupInviteSchema, inviteOf(group));
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ token: string }>(
    apiUrl('/student/group-invites/:token'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const group = groupByToken(params.token);
        if (!group) return apiError('NOT_FOUND', 'Группа не найдена');
        const club = db.clubs.find((c) => c.id === group.clubId)!;
        const students = studentIdsOfGroup(group.id);
        return json(GroupInvitePreviewSchema, {
          token: params.token,
          group: groupBrief(group.id),
          description: club.description,
          schedule: scheduleOfGroup(group.id),
          price: club.price,
          billingPeriod: club.billingPeriod,
          studentsCount: students.length,
          joined: students.includes(student.id),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ token: string }>(
    apiUrl('/student/group-invites/:token/join'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const group = groupByToken(params.token);
        if (!group) return apiError('NOT_FOUND', 'Группа не найдена');
        let enrollment = db.enrollments.find(
          (e) => e.studentId === student.id && e.groupId === group.id,
        );
        const alreadyJoined = enrollment?.status === 'ACTIVE';
        if (!enrollment) {
          enrollment = {
            id: crypto.randomUUID(),
            studentId: student.id,
            groupId: group.id,
            status: 'ACTIVE',
            enrolledAt: new Date().toISOString(),
            leftAt: null,
          };
          db.enrollments.push(enrollment);
        } else if (!alreadyJoined) {
          Object.assign(enrollment, {
            status: 'ACTIVE',
            leftAt: null,
            enrolledAt: new Date().toISOString(),
          });
        }
        return json(JoinGroupResultSchema, {
          group: groupBrief(group.id),
          enrollmentId: enrollment.id,
          alreadyJoined,
        });
      },
      ['STUDENT'],
    ),
  ),
];
