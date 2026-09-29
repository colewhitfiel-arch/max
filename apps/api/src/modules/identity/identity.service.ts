import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthResult,
  CLUB_CATEGORIES,
  type MeDto,
  type Role,
  type StudentBrief,
  type TokenPair,
  type UserBrief,
  type UpdateSettingsBody,
  type UpdateTeacherProfileBody,
} from '@edu/contracts';
import { demoUsers } from '@edu/contracts/fixtures';
import { AUTH_PROVIDER, type AuthProvider } from '../../common/auth/auth-provider';
import type { AuthUser } from '../../common/auth/auth-user';
import { JwtService } from '../../common/auth/jwt.service';
import { DevAuthProvider } from '../../common/auth/providers/dev-auth.provider';
import { Errors } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/logger.service';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { FamilyService } from '../family/family.service';
import { SchoolService } from '../school/school.service';
import { IdentityRepository, type UserWithProfiles } from './identity.repository';

const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Сессии и личность: вход через провайдера, роли, профили, переключение роли, refresh, /me.
 * Единственный источник AuthUser для JWT.
 */
@Injectable()
export class IdentityService {
  private readonly log;

  constructor(
    private readonly repo: IdentityRepository,
    private readonly jwt: JwtService,
    private readonly school: SchoolService,
    private readonly family: FamilyService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
    // Dev-вход не зависит от того, какой провайдер обслуживает launch-параметры MAX:
    // демо-стенд должен принимать и подпись MAX, и вход демо-пользователем.
    private readonly devAuthProvider: DevAuthProvider,
    @InjectEnv() private readonly env: Env,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'identity' });
  }

  // --- вход ---

  async loginWithMax(launchParams: string): Promise<AuthResult> {
    if (this.authProvider.name !== 'max')
      throw Errors.businessRule('Вход через MAX отключён (AUTH_PROVIDER)');
    const identity = await this.authProvider.verify({ kind: 'max', launchParams });
    const user = await this.repo.upsertByIdentity(identity);
    return this.issueSession(user, this.pickActiveRole(user, null));
  }

  /**
   * Вход демо-пользователем. Разрешён везде, кроме production: на демо-стенде `AUTH_PROVIDER=max`
   * (нужен для подписи мини-приложения), но открыть стенд в обычном браузере тоже надо.
   * При `AUTH_PROVIDER=max` в базе есть настоящие пользователи MAX, и произвольный maxUserId
   * был бы входом в чужой аккаунт: там пускаем только демо-пользователей и только в их роли.
   */
  async loginDev(maxUserId: string, roles: Role[]): Promise<AuthResult> {
    if (this.env.APP_ENV === 'production') throw Errors.forbidden('Dev-вход недоступен');
    if (this.authProvider.name === 'max') {
      const demo = Object.values(demoUsers).find((u) => u.maxUserId === maxUserId);
      if (!demo || roles.some((role) => !demo.roles.includes(role)))
        throw Errors.forbidden('На этом стенде демо-вход — только демо-пользователями');
    }
    const identity = await this.devAuthProvider.verify({ kind: 'dev', maxUserId });
    let user = await this.repo.upsertByIdentity(identity);
    for (const role of roles) {
      if (!this.hasRoleWithProfile(user, role)) await this.grantRole(user, role, undefined);
    }
    user = (await this.repo.findById(user.id))!;
    this.log.info({ userId: user.id, roles }, 'dev-вход');
    return this.issueSession(user, roles[0] ?? this.pickActiveRole(user, null));
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = JwtService.hashRefreshToken(refreshToken);
    const stored = await this.repo.findRefreshToken(hash);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date())
      throw Errors.unauthorized('Сессия истекла');
    const user = await this.repo.findById(stored.userId);
    if (!user) throw Errors.unauthorized();
    // Атомарный захват: из параллельных refresh с одним токеном новую пару получит только один
    if (!(await this.repo.consumeRefreshToken(hash))) throw Errors.unauthorized('Сессия истекла');
    const activeRole = this.pickActiveRole(user, stored.activeRole);
    return this.issueTokens(user, activeRole);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repo.revokeRefreshToken(JwtService.hashRefreshToken(refreshToken));
  }

  // --- роли ---

  async addRole(auth: AuthUser, role: Role, inviteCode?: string): Promise<AuthResult> {
    const user = await this.requireUser(auth.userId);
    // Недостающий профиль при уже выданной роли (сбой прошлой выдачи) досоздаётся здесь же
    if (!this.hasRoleWithProfile(user, role)) await this.grantRole(user, role, inviteCode);
    return this.issueSession((await this.repo.findById(user.id))!, role);
  }

  async updateAvatar(_auth: AuthUser, _fileId: string | null): Promise<MeDto> {
    // Нужен стабильный URL/ключ аватара (подписанные ссылки files живут час) — схема не готова
    throw Errors.notImplemented('Смена фото профиля');
  }

  private hasRoleWithProfile(user: UserWithProfiles, role: Role): boolean {
    if (!user.roles.some((r) => r.role === role)) return false;
    if (role === 'STUDENT') return user.student !== null;
    if (role === 'PARENT') return user.parent !== null;
    if (role === 'TEACHER') return user.teacher !== null;
    return true;
  }

  async switchRole(auth: AuthUser, role: Role): Promise<AuthResult> {
    const user = await this.requireUser(auth.userId);
    if (!user.roles.some((r) => r.role === role))
      throw Errors.forbidden('У пользователя нет этой роли');
    return this.issueSession(user, role);
  }

  private async grantRole(
    user: UserWithProfiles,
    role: Role,
    inviteCode: string | undefined,
  ): Promise<void> {
    switch (role) {
      // Сначала профиль, потом роль: сбой посередине не оставит роль без профиля
      case 'STUDENT': {
        if (!user.student) {
          let schoolId: string | null = null;
          if (inviteCode) schoolId = (await this.school.findByInviteCode(inviteCode))?.id ?? null;
          await this.repo.createStudentProfile(user.id, await this.generateLinkCode(), schoolId);
        }
        await this.repo.addRole(user.id, 'STUDENT');
        return;
      }
      case 'PARENT':
        if (!user.parent) await this.repo.createParentProfile(user.id);
        await this.repo.addRole(user.id, 'PARENT');
        return;
      case 'TEACHER': {
        let schoolId = user.teacher?.schoolId ?? null;
        if (!schoolId) {
          if (!inviteCode) {
            // Только в локальной разработке допускаем вход преподавателем без кода — берём
            // первую школу. На стенде (staging) код обязателен: демо-преподаватель уже с профилем.
            if (this.env.APP_ENV === 'development')
              schoolId = (await this.school.findByInviteCode('SCHOOL1'))?.id ?? null;
            if (!schoolId)
              throw Errors.businessRule('Для роли преподавателя нужен код приглашения школы');
          } else {
            schoolId = (await this.school.findByInviteCode(inviteCode))?.id ?? null;
            if (!schoolId) throw Errors.businessRule('Код приглашения школы не найден');
          }
        }
        await this.repo.addRole(user.id, 'TEACHER');
        if (!user.teacher) await this.repo.createTeacherProfile(user.id, schoolId);
        return;
      }
      case 'SCHOOL_ADMIN':
        throw Errors.notImplemented('Роль администратора школы');
    }
  }

  // --- профиль ---

  async getMe(userId: string, activeRole: Role | null): Promise<MeDto> {
    return this.toMe(await this.requireUser(userId), activeRole);
  }

  async updateSettings(auth: AuthUser, body: UpdateSettingsBody): Promise<MeDto> {
    await this.repo.updateSettings(auth.userId, body);
    return this.getMe(auth.userId, auth.activeRole);
  }

  /** Что ведёт преподаватель и кто он: кружки без повторов, в порядке `CLUB_CATEGORIES`. */
  async updateTeacherProfile(auth: AuthUser, body: UpdateTeacherProfileBody): Promise<MeDto> {
    const user = await this.requireUser(auth.userId);
    if (!user.teacher) throw Errors.forbidden('Только для преподавателя');
    const qualification =
      body.qualification === undefined ? undefined : body.qualification?.trim() || null;
    await this.repo.updateTeacherProfile(user.teacher.id, {
      subjects: body.subjects && CLUB_CATEGORIES.filter((c) => body.subjects?.includes(c)),
      qualification,
    });
    return this.getMe(auth.userId, auth.activeRole);
  }

  async rotateLinkCode(auth: AuthUser): Promise<string> {
    const user = await this.requireUser(auth.userId);
    if (!user.student) throw Errors.forbidden('Только для ученика');
    const linkCode = await this.generateLinkCode();
    await this.repo.setLinkCode(user.student.id, linkCode);
    return linkCode;
  }

  /** Публичный метод для модуля ai: сохранить профиль из онбординга и закрыть онбординг. */
  async completeStudentOnboarding(
    studentProfileId: string,
    profile: {
      interests: string[];
      goals: string[];
      weeklyHours: number;
      preferredFormats: string[];
      futureInterests?: string[];
      summary: string;
    },
  ): Promise<void> {
    await this.repo.updateStudentOnboarding(studentProfileId, {
      interests: profile.interests,
      goals: profile.goals,
      weeklyHours: profile.weeklyHours > 0 ? profile.weeklyHours : null,
      preferredFormats: profile.preferredFormats,
      futureInterests: profile.futureInterests ?? [],
      aiProfileSummary: profile.summary.trim() || null,
    });
  }

  /** Для модуля ai: профиль ученика (школа, анкета онбординга, имя/ник) без чтения чужих таблиц. */
  async getStudentProfile(studentProfileId: string) {
    return this.repo.findStudentProfile(studentProfileId);
  }

  /** Для других модулей: ученик по коду привязки, который он показал родителю. */
  async findStudentIdByLinkCode(linkCode: string): Promise<string | null> {
    return this.repo.findStudentIdByLinkCode(linkCode.trim().toUpperCase());
  }

  /** Для других модулей: пользователь родителя по id профиля (кто приглашает ребёнка). */
  async parentUserBrief(parentProfileId: string): Promise<UserBrief | null> {
    return this.repo.findParentUserBrief(parentProfileId);
  }

  /** Для других модулей: `StudentBrief` по id профилей (списки платежей, отчёты). */
  async studentBriefsByIds(studentIds: string[]): Promise<Map<string, StudentBrief>> {
    const rows = await this.repo.findStudentBriefs(studentIds);
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, user: row.user, classLabel: row.classLabel } satisfies StudentBrief,
      ]),
    );
  }

  /**
   * Для других модулей: пользователь по id профиля роли — адресат уведомления или события.
   * null — профиля нет.
   */
  async userIdOfProfile(
    role: 'STUDENT' | 'PARENT' | 'TEACHER',
    profileId: string,
  ): Promise<string | null> {
    return this.repo.findUserIdOfProfile(role, profileId);
  }

  /** Для других модулей: школа преподавателя по id профиля (null — профиля нет). */
  async getTeacherSchoolId(teacherProfileId: string): Promise<string | null> {
    return this.repo.findTeacherSchoolId(teacherProfileId);
  }

  /** Для других модулей: id профилей учеников школы (кого преподаватель может взять в группу). */
  async listStudentIdsOfSchool(schoolId: string): Promise<string[]> {
    return this.repo.findStudentIdsOfSchool(schoolId);
  }

  /**
   * Школа пользователя для экранов, общих для всех ролей (каталог, публичный профиль):
   * у ученика и преподавателя — своя, у родителя — школа первого привязанного ребёнка.
   * null — школы нет (роль ещё не оформлена); вызывающий показывает всё, что активно.
   */
  async schoolIdOfUser(user: AuthUser): Promise<string | null> {
    const profile = await this.repo.findById(user.userId);
    if (!profile) return null;
    if (profile.student?.schoolId) return profile.student.schoolId;
    if (profile.teacher?.schoolId) return profile.teacher.schoolId;
    if (!profile.parent) return null;
    const [childId] = await this.family.listChildStudentIds(profile.parent.id);
    if (!childId) return null;
    const child = await this.repo.findStudentProfile(childId);
    return child?.schoolId ?? null;
  }

  /** Для других модулей: AuthUser по userId и роли (например, для тестов и фоновых задач). */
  async buildAuthUser(userId: string, activeRole: Role | null): Promise<AuthUser> {
    const user = await this.requireUser(userId);
    return this.toAuthUser(user, this.pickActiveRole(user, activeRole));
  }

  // --- внутреннее ---

  private async requireUser(userId: string): Promise<UserWithProfiles> {
    const user = await this.repo.findById(userId);
    if (!user) throw Errors.unauthorized('Пользователь не найден');
    return user;
  }

  private pickActiveRole(user: UserWithProfiles, preferred: Role | null): Role | null {
    const roles = user.roles.map((r) => r.role);
    if (preferred && roles.includes(preferred)) return preferred;
    return roles[0] ?? null;
  }

  private profileIdFor(user: UserWithProfiles, role: Role | null): string | null {
    if (role === 'STUDENT') return user.student?.id ?? null;
    if (role === 'PARENT') return user.parent?.id ?? null;
    if (role === 'TEACHER') return user.teacher?.id ?? null;
    return null;
  }

  private toAuthUser(user: UserWithProfiles, activeRole: Role | null): AuthUser {
    return {
      userId: user.id,
      maxUserId: user.maxUserId,
      roles: user.roles.map((r) => r.role),
      activeRole,
      profileId: this.profileIdFor(user, activeRole),
    };
  }

  private async issueTokens(user: UserWithProfiles, activeRole: Role | null): Promise<TokenPair> {
    const accessToken = await this.jwt.signAccess(this.toAuthUser(user, activeRole));
    const refresh = this.jwt.generateRefreshToken();
    await this.repo.createRefreshToken(user.id, refresh.hash, refresh.expiresAt, activeRole);
    // Оппортунистическая чистка: истёкшие и отозванные токены пользователя больше не нужны
    await this.repo
      .deleteDeadRefreshTokens(user.id)
      .catch((err: unknown) => this.log.warn({ userId: user.id, err }, 'чистка refresh-токенов'));
    return { accessToken, refreshToken: refresh.token };
  }

  private async issueSession(user: UserWithProfiles, activeRole: Role | null): Promise<AuthResult> {
    const tokens = await this.issueTokens(user, activeRole);
    return { ...tokens, me: await this.toMe(user, activeRole) };
  }

  private async toMe(user: UserWithProfiles, activeRole: Role | null): Promise<MeDto> {
    const roles = user.roles.map((r) => r.role);
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      },
      roles,
      activeRole: this.pickActiveRole(user, activeRole),
      needsRoleSetup: roles.length === 0,
      settings: { theme: user.theme, locale: user.locale },
      student: user.student
        ? {
            id: user.student.id,
            onboardingCompleted: user.student.onboardingCompletedAt !== null,
            schoolId: user.student.schoolId,
            linkCode: user.student.linkCode,
            classLabel: user.student.classLabel,
          }
        : null,
      parent: user.parent
        ? { id: user.parent.id, childrenCount: await this.family.countChildren(user.parent.id) }
        : null,
      teacher: user.teacher
        ? {
            id: user.teacher.id,
            schoolId: user.teacher.schoolId,
            subjects: user.teacher.subjects,
            qualification: user.teacher.qualification,
          }
        : null,
    };
  }

  private async generateLinkCode(): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      let code = '';
      for (let j = 0; j < 6; j += 1)
        code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
      if (!(await this.repo.linkCodeExists(code))) return code;
    }
    throw Errors.internal('Не удалось сгенерировать код привязки');
  }
}
