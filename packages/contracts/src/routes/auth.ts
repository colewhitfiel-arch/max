/**
 * Аутентификация, роли, профиль текущего пользователя. Владелец — B1.
 * docs/05-api-contracts.md §5.3 `auth.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IdSchema } from '../common';
import { RoleSchema } from '../enums';
import { UserBriefSchema, UserSettingsSchema } from '../entities';
import { contractRouterOptions, publicRoute, userRoute } from './meta';

const c = initContract();

// ---------- DTO ----------

export const MeStudentSchema = z.object({
  id: IdSchema,
  onboardingCompleted: z.boolean(),
  schoolId: IdSchema.nullable(),
  /** Код для привязки родителя (`POST /parent/children/link`). */
  linkCode: z.string(),
  classLabel: z.string().nullable(),
});
export type MeStudent = z.infer<typeof MeStudentSchema>;

export const MeParentSchema = z.object({
  id: IdSchema,
  childrenCount: z.number().int().nonnegative(),
});
export type MeParent = z.infer<typeof MeParentSchema>;

export const MeTeacherSchema = z.object({
  id: IdSchema,
  schoolId: IdSchema,
});
export type MeTeacher = z.infer<typeof MeTeacherSchema>;

/** Текущий пользователь: роли, активная роль и профили по ролям (null, если профиля нет). */
export const MeDtoSchema = z.object({
  user: UserBriefSchema,
  roles: z.array(RoleSchema),
  activeRole: RoleSchema.nullable(),
  /** true — ролей нет, нужно пройти выбор роли. */
  needsRoleSetup: z.boolean(),
  settings: UserSettingsSchema,
  student: MeStudentSchema.nullable(),
  parent: MeParentSchema.nullable(),
  teacher: MeTeacherSchema.nullable(),
});
export type MeDto = z.infer<typeof MeDtoSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const AuthResultSchema = TokenPairSchema.extend({ me: MeDtoSchema });
export type AuthResult = z.infer<typeof AuthResultSchema>;

export const LinkCodeSchema = z.object({ linkCode: z.string().min(1) });
export type LinkCode = z.infer<typeof LinkCodeSchema>;

// ---------- Тела запросов ----------

export const LoginMaxBodySchema = z.object({
  /** Сырые launch-параметры MAX Bridge (подпись проверяет сервер). */
  launchParams: z.string().min(1),
});
export type LoginMaxBody = z.infer<typeof LoginMaxBodySchema>;

export const LoginDevBodySchema = z.object({
  maxUserId: z.string().min(1),
  roles: z.array(RoleSchema).min(1),
});
export type LoginDevBody = z.infer<typeof LoginDevBodySchema>;

export const RefreshBodySchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshBody = z.infer<typeof RefreshBodySchema>;

export const AddRoleBodySchema = z.object({
  role: RoleSchema,
  /** Обязателен для TEACHER — School.inviteCode. */
  inviteCode: z.string().min(1).optional(),
});
export type AddRoleBody = z.infer<typeof AddRoleBodySchema>;

export const SwitchRoleBodySchema = z.object({ role: RoleSchema });
export type SwitchRoleBody = z.infer<typeof SwitchRoleBodySchema>;

export const LogoutBodySchema = z.object({ refreshToken: z.string().min(1) });
export type LogoutBody = z.infer<typeof LogoutBodySchema>;

export const UpdateSettingsBodySchema = UserSettingsSchema.partial();
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;

export const UpdateAvatarBodySchema = z.object({
  /** Файл с purpose `AVATAR` (после `POST /files/:fileId/confirm`); null — убрать фото. */
  fileId: IdSchema.nullable(),
});
export type UpdateAvatarBody = z.infer<typeof UpdateAvatarBodySchema>;

// ---------- Роуты ----------

export const authContract = c.router(
  {
    loginMax: {
      method: 'POST',
      path: '/auth/max',
      body: LoginMaxBodySchema,
      responses: { 200: AuthResultSchema },
      summary: 'Вход по launch-параметрам MAX',
      metadata: publicRoute(),
    },
    loginDev: {
      method: 'POST',
      path: '/auth/dev',
      body: LoginDevBodySchema,
      responses: { 200: AuthResultSchema },
      summary: 'Dev-вход без MAX (только в dev-окружении)',
      metadata: publicRoute({ devOnly: true }),
    },
    refresh: {
      method: 'POST',
      path: '/auth/refresh',
      body: RefreshBodySchema,
      responses: { 200: TokenPairSchema },
      summary: 'Обновить пару токенов по refreshToken',
      metadata: publicRoute(),
    },
    addRole: {
      method: 'POST',
      path: '/auth/roles',
      body: AddRoleBodySchema,
      responses: { 200: AuthResultSchema },
      summary: 'Добавить роль (STUDENT/PARENT свободно, TEACHER — по inviteCode школы)',
      metadata: userRoute(),
    },
    switchRole: {
      method: 'POST',
      path: '/auth/switch-role',
      body: SwitchRoleBodySchema,
      responses: { 200: AuthResultSchema },
      summary: 'Переключить активную роль',
      metadata: userRoute(),
    },
    logout: {
      method: 'POST',
      path: '/auth/logout',
      body: LogoutBodySchema,
      responses: { 204: c.noBody() },
      summary: 'Выход: отозвать refreshToken',
      metadata: userRoute(),
    },
    getMe: {
      method: 'GET',
      path: '/me',
      responses: { 200: MeDtoSchema },
      summary: 'Текущий пользователь, роли и профили',
      metadata: userRoute(),
    },
    updateSettings: {
      method: 'PATCH',
      path: '/me/settings',
      body: UpdateSettingsBodySchema,
      responses: { 200: MeDtoSchema },
      summary: 'Изменить тему и язык',
      metadata: userRoute('common:settings.edit'),
    },
    updateAvatar: {
      method: 'PUT',
      path: '/me/avatar',
      body: UpdateAvatarBodySchema,
      responses: { 200: MeDtoSchema },
      summary: 'Сменить или убрать фото профиля',
      metadata: userRoute('common:profile.edit'),
    },
    rotateLinkCode: {
      method: 'POST',
      path: '/student/link-code/rotate',
      body: c.noBody(),
      responses: { 200: LinkCodeSchema },
      summary: 'Сгенерировать новый код привязки родителя',
      metadata: userRoute('common:profile.edit', ['STUDENT']),
    },
  },
  contractRouterOptions,
);
