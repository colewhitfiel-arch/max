import type { Role } from '@edu/contracts';

/** Пользователь запроса: содержимое access JWT. Единственный способ узнать «кто вызывает». */
export interface AuthUser {
  userId: string;
  maxUserId: string;
  roles: Role[];
  /** Активная роль сессии (одна из roles) или null, если роли ещё нет. */
  activeRole: Role | null;
  /** id профиля активной роли (StudentProfile.id / ParentProfile.id / TeacherProfile.id). */
  profileId: string | null;
}

/** Внешняя личность, подтверждённая провайдером аутентификации (MAX или dev). */
export interface ExternalIdentity {
  maxUserId: string;
  firstName: string;
  lastName?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  locale?: 'ru' | 'en';
}
