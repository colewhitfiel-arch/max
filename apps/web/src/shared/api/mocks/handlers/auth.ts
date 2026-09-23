/**
 * Auth-моки: dev-вход выдаёт токены-заглушки и MeDto по демо-пользователям; refresh, me,
 * switch-role, roles, logout, settings, аватар (файл purpose AVATAR из files-моков), link-code.
 */
import {
  AddRoleBodySchema,
  AuthResultSchema,
  LinkCodeSchema,
  LoginDevBodySchema,
  LoginMaxBodySchema,
  LogoutBodySchema,
  MeDtoSchema,
  RefreshBodySchema,
  SwitchRoleBodySchema,
  TokenPairSchema,
  UpdateAvatarBodySchema,
  UpdateSettingsBodySchema,
} from '@edu/contracts';
import { demoUsers } from '@edu/contracts/fixtures';
import { http } from 'msw';
import { buildMe } from '../demo';
import {
  apiError,
  apiUrl,
  authed,
  issueTokens,
  json,
  noContent,
  parseToken,
  readBody,
} from '../lib';
import { createUser, db, findUserByMaxId, grantRole, type MockUser, studentOfUser } from '../state';
import { fileDto } from './files';
import type { Role } from '@edu/contracts';

function authResult(user: MockUser, role: Role | null) {
  return json(AuthResultSchema, { ...issueTokens(user.id, role), me: buildMe(user, role) });
}

export const authHandlers = [
  http.post(apiUrl('/auth/dev'), async ({ request }) => {
    const body = await readBody(request, LoginDevBodySchema);
    if (!body.ok) return body.response;
    let user = findUserByMaxId(body.data.maxUserId);
    if (!user) user = createUser(body.data.maxUserId, body.data.roles);
    else for (const role of body.data.roles) grantRole(user, role);
    return authResult(user, body.data.roles[0] ?? null);
  }),

  http.post(apiUrl('/auth/max'), async ({ request }) => {
    const body = await readBody(request, LoginMaxBodySchema);
    if (!body.ok) return body.response;
    // В моке любые launch-параметры — это ученик Алексей.
    const user = db.users.get(demoUsers.student1.id)!;
    return authResult(user, user.roles[0] ?? null);
  }),

  http.post(apiUrl('/auth/refresh'), async ({ request }) => {
    const body = await readBody(request, RefreshBodySchema);
    if (!body.ok) return body.response;
    const parsed = parseToken(body.data.refreshToken, 'refresh');
    const user = parsed ? db.users.get(parsed.userId) : undefined;
    if (!parsed || !user) return apiError('UNAUTHORIZED', 'Сессия истекла');
    return json(TokenPairSchema, issueTokens(user.id, parsed.role));
  }),

  http.post(
    apiUrl('/auth/roles'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, AddRoleBodySchema);
      if (!body.ok) return body.response;
      if (body.data.role === 'SCHOOL_ADMIN')
        return apiError('NOT_IMPLEMENTED', 'Роль администратора школы');
      grantRole(auth.user, body.data.role);
      return authResult(auth.user, body.data.role);
    }),
  ),

  http.post(
    apiUrl('/auth/switch-role'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, SwitchRoleBodySchema);
      if (!body.ok) return body.response;
      if (!auth.user.roles.includes(body.data.role))
        return apiError('FORBIDDEN', 'У пользователя нет этой роли');
      return authResult(auth.user, body.data.role);
    }),
  ),

  http.post(
    apiUrl('/auth/logout'),
    authed(async ({ request }) => {
      const body = await readBody(request, LogoutBodySchema);
      if (!body.ok) return body.response;
      return noContent();
    }),
  ),

  http.get(
    apiUrl('/me'),
    authed(({ auth }) => json(MeDtoSchema, buildMe(auth.user, auth.role))),
  ),

  http.patch(
    apiUrl('/me/settings'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, UpdateSettingsBodySchema);
      if (!body.ok) return body.response;
      const current = db.settings.get(auth.user.id) ?? {
        theme: auth.user.theme,
        locale: auth.user.locale,
      };
      db.settings.set(auth.user.id, { ...current, ...body.data });
      return json(MeDtoSchema, buildMe(auth.user, auth.role));
    }),
  ),

  http.put(
    apiUrl('/me/avatar'),
    authed(async ({ auth, request }) => {
      const body = await readBody(request, UpdateAvatarBodySchema);
      if (!body.ok) return body.response;
      const { fileId } = body.data;
      if (fileId === null) {
        auth.user.avatarUrl = null;
      } else {
        const file = db.files.find((f) => f.id === fileId && f.ownerUserId === auth.user.id);
        if (!file) return apiError('NOT_FOUND', 'Файл не найден');
        if (!file.confirmed) return apiError('BUSINESS_RULE', 'Файл ещё не подтверждён');
        if (file.purpose !== 'AVATAR' || !file.mime.startsWith('image/')) {
          return apiError('VALIDATION', 'Для фото профиля нужна картинка с purpose AVATAR');
        }
        // В браузере — object URL на загруженные байты; иначе ссылка «скачивания» из FileDto.
        auth.user.avatarUrl = file.objectUrl ?? fileDto(file).url;
      }
      return json(MeDtoSchema, buildMe(auth.user, auth.role));
    }),
  ),

  http.post(
    apiUrl('/student/link-code/rotate'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Только для ученика');
        student.linkCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        return json(LinkCodeSchema, { linkCode: student.linkCode });
      },
      ['STUDENT'],
    ),
  ),
];
