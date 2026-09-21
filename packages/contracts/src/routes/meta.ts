/**
 * Метаданные роутов ts-rest: кто имеет доступ. Читаются guard'ами на бэке
 * (auth + roles/permission) и фронтом для скрытия недоступных экранов.
 * Ресурсные проверки («своя ли группа») — в policies модулей, не здесь.
 */
import { z } from 'zod';
import { type Role } from '../enums';
import { commonErrorResponses } from '../errors';
import { type Permission, rolesWithPermission } from '../permissions';

/**
 * Общие опции для всех доменных роутеров: единый формат ошибок (4xx/5xx → ApiError) и строгие
 * статус-коды. Применяются на уровне каждого домена, а не в `apiContract`: тип роутера со
 * всеми ~80 роутами превышает лимит сериализации d.ts у TypeScript (TS7056).
 */
export const contractRouterOptions = {
  commonResponses: commonErrorResponses,
  strictStatusCodes: true,
} as const;

export type RouteAuth = 'public' | 'user';

export interface RouteMeta {
  /** `public` — без токена; `user` — нужен валидный access JWT. */
  auth: RouteAuth;
  /** Роли (activeRole из JWT), которым разрешён роут. Отсутствует — любая авторизованная. */
  roles?: Role[];
  /** Permission из `permissions.ts`, которую проверяет guard. */
  permission?: Permission;
  /** Роут доступен только в dev-окружении (например, `POST /auth/dev`). */
  devOnly?: boolean;
}

/** Публичный роут (без авторизации). */
export function publicRoute(options: { devOnly?: boolean } = {}): RouteMeta {
  return options.devOnly ? { auth: 'public', devOnly: true } : { auth: 'public' };
}

/**
 * Роут для авторизованного пользователя. Без permission — любая роль (и даже без activeRole,
 * например `GET /me` на этапе выбора роли). С permission роли по умолчанию берутся из
 * `rolesWithPermission`; можно сузить явным списком.
 */
export function userRoute(permission?: Permission, roles?: Role[]): RouteMeta {
  if (!permission) return roles ? { auth: 'user', roles } : { auth: 'user' };
  return { auth: 'user', permission, roles: roles ?? rolesWithPermission(permission) };
}

/** Заголовок идемпотентности для POST из docs/05 §5.1. Ключи заголовков — в нижнем регистре. */
export const IdempotencyKeyHeadersSchema = z.object({
  'idempotency-key': z.string().min(1).max(128).optional(),
});
export type IdempotencyKeyHeaders = z.infer<typeof IdempotencyKeyHeadersSchema>;
