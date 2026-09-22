import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthResult, MeDto, Role, TokenPair, UpdateSettingsBody } from '@edu/contracts';
import { AUTH_PROVIDER, type AuthProvider } from '../../common/auth/auth-provider';
import type { AuthUser } from '../../common/auth/auth-user';
import { JwtService } from '../../common/auth/jwt.service';
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

  async loginDev(maxUserId: string, roles: Role[]): Promise<AuthResult> {
    if (this.env.APP_ENV === 'production' || this.authProvider.name !== 'dev') {
      throw Errors.forbidden('Dev-вход недоступен');
    }
    const identity = await this.authProvider.verify({ kind: 'dev', maxUserId });
    let user = await this.repo.upsertByIdentity(identity);
    for (const role of roles) {
      if (!user.roles.some((r) => r.role === role)) await this.grantRole(user, role, undefined);
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
    await this.repo.revokeRefreshToken(hash);
    const activeRole = this.pickActiveRole(user, stored.activeRole);
    return this.issueTokens(user, activeRole);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repo.revokeRefreshToken(JwtService.hashRefreshToken(refreshToken));
  }

  // --- роли ---

  async addRole(auth: AuthUser, role: Role, inviteCode?: string): Promise<AuthResult> {
    const user = await this.requireUser(auth.userId);
    if (!user.roles.some((r) => r.role === role)) await this.grantRole(user, role, inviteCode);
    return this.issueSession((await this.repo.findById(user.id))!, role);
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
      case 'STUDENT': {
        await this.repo.addRole(user.id, 'STUDENT');
        let schoolId: string | null = null;
        if (inviteCode) schoolId = (await this.school.findByInviteCode(inviteCode))?.id ?? null;
        if (!user.student)
          await this.repo.createStudentProfile(user.id, await this.generateLinkCode(), schoolId);
        return;
      }
      case 'PARENT':
        await this.repo.addRole(user.id, 'PARENT');
        if (!user.parent) await this.repo.createParentProfile(user.id);
        return;
      case 'TEACHER': {
        let schoolId = user.teacher?.schoolId ?? null;
        if (!schoolId) {
          if (!inviteCode) {
            // В dev допускаем вход преподавателем без кода — берём первую школу
            if (this.env.APP_ENV !== 'production')
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
      teacher: user.teacher ? { id: user.teacher.id, schoolId: user.teacher.schoolId } : null,
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
