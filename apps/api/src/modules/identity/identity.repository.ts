import { Injectable } from '@nestjs/common';
import type { ClubCategory, Role } from '@edu/contracts';
import type { Prisma } from '@edu/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ExternalIdentity } from '../../common/auth/auth-user';

const userWithProfiles = {
  roles: { select: { role: true } },
  student: {
    select: {
      id: true,
      schoolId: true,
      classLabel: true,
      linkCode: true,
      onboardingCompletedAt: true,
    },
  },
  parent: { select: { id: true } },
  teacher: { select: { id: true, schoolId: true, subjects: true, qualification: true } },
} satisfies Prisma.UserInclude;

export type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof userWithProfiles }>;

/** Доступ к таблицам identity: users, user_roles, *_profiles, refresh_tokens. Только этот модуль. */
@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertByIdentity(identity: ExternalIdentity): Promise<UserWithProfiles> {
    return this.prisma.user.upsert({
      where: { maxUserId: identity.maxUserId },
      create: {
        maxUserId: identity.maxUserId,
        firstName: identity.firstName,
        lastName: identity.lastName ?? null,
        nickname: identity.nickname ?? null,
        avatarUrl: identity.avatarUrl ?? null,
        locale: identity.locale ?? 'ru',
        lastSeenAt: new Date(),
        notificationSettings: { create: {} },
      },
      update: {
        firstName: identity.firstName,
        lastName: identity.lastName ?? null,
        nickname: identity.nickname ?? null,
        avatarUrl: identity.avatarUrl ?? null,
        lastSeenAt: new Date(),
      },
      include: userWithProfiles,
    });
  }

  async findById(userId: string): Promise<UserWithProfiles | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, include: userWithProfiles });
  }

  async addRole(userId: string, role: Role): Promise<void> {
    await this.prisma.userRole.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role },
      update: {},
    });
  }

  async createStudentProfile(
    userId: string,
    linkCode: string,
    schoolId: string | null,
  ): Promise<void> {
    await this.prisma.studentProfile.upsert({
      where: { userId },
      create: { userId, linkCode, schoolId },
      update: {},
    });
  }

  async createParentProfile(userId: string): Promise<void> {
    await this.prisma.parentProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async createTeacherProfile(userId: string, schoolId: string): Promise<void> {
    await this.prisma.teacherProfile.upsert({
      where: { userId },
      create: { userId, schoolId },
      update: {},
    });
  }

  async updateTeacherProfile(
    teacherProfileId: string,
    data: { subjects?: ClubCategory[]; qualification?: string | null },
  ): Promise<void> {
    await this.prisma.teacherProfile.update({ where: { id: teacherProfileId }, data });
  }

  async updateSettings(
    userId: string,
    data: { theme?: 'SYSTEM' | 'LIGHT' | 'DARK'; locale?: 'ru' | 'en' },
  ): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data });
  }

  async updateStudentOnboarding(
    studentProfileId: string,
    data: {
      interests: string[];
      goals: string[];
      weeklyHours: number | null;
      preferredFormats: string[];
      futureInterests: string[];
      aiProfileSummary: string | null;
    },
  ): Promise<void> {
    await this.prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: { ...data, onboardingCompletedAt: new Date() },
    });
  }

  async setLinkCode(studentProfileId: string, linkCode: string): Promise<void> {
    await this.prisma.studentProfile.update({
      where: { id: studentProfileId },
      data: { linkCode },
    });
  }

  async findStudentProfile(studentProfileId: string) {
    return this.prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: {
        id: true,
        schoolId: true,
        classLabel: true,
        interests: true,
        goals: true,
        weeklyHours: true,
        preferredFormats: true,
        futureInterests: true,
        aiProfileSummary: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /** Краткие карточки учеников по id профилей — для списков в других модулях. */
  async findStudentBriefs(studentIds: string[]) {
    if (studentIds.length === 0) return [];
    return this.prisma.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        classLabel: true,
        user: {
          select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true },
        },
      },
    });
  }

  /** id профилей учеников школы — кандидаты в группы преподавателя этой школы. */
  async findStudentIdsOfSchool(schoolId: string): Promise<string[]> {
    const rows = await this.prisma.studentProfile.findMany({
      where: { schoolId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** userId по id профиля роли — кому слать уведомление (`null`, если профиля нет). */
  async findUserIdOfProfile(
    role: 'STUDENT' | 'PARENT' | 'TEACHER',
    profileId: string,
  ): Promise<string | null> {
    const where = { id: profileId };
    const select = { userId: true };
    const row =
      role === 'STUDENT'
        ? await this.prisma.studentProfile.findUnique({ where, select })
        : role === 'PARENT'
          ? await this.prisma.parentProfile.findUnique({ where, select })
          : await this.prisma.teacherProfile.findUnique({ where, select });
    return row?.userId ?? null;
  }

  async findTeacherSchoolId(teacherProfileId: string): Promise<string | null> {
    const row = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { schoolId: true },
    });
    return row?.schoolId ?? null;
  }

  /** Ученик по коду, который он показывает родителю (null — кода нет). */
  async findStudentIdByLinkCode(linkCode: string): Promise<string | null> {
    const row = await this.prisma.studentProfile.findUnique({
      where: { linkCode },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** `UserBrief` по id профиля родителя — кто приглашает ребёнка. */
  async findParentUserBrief(parentProfileId: string) {
    const row = await this.prisma.parentProfile.findUnique({
      where: { id: parentProfileId },
      select: {
        user: {
          select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true },
        },
      },
    });
    return row?.user ?? null;
  }

  async linkCodeExists(linkCode: string): Promise<boolean> {
    return (await this.prisma.studentProfile.count({ where: { linkCode } })) > 0;
  }

  // --- refresh tokens ---

  async createRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    activeRole: Role | null,
  ): Promise<void> {
    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt, activeRole } });
  }

  async findRefreshToken(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Атомарно «забрать» refresh-токен для ротации: помечает его отозванным, только если он ещё
   * не отозван и не истёк. false — токен уже использован (параллельный refresh) или недействителен.
   */
  async consumeRefreshToken(tokenHash: string, now = new Date()): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return result.count > 0;
  }

  /** Удалить мёртвые (истёкшие или отозванные) refresh-токены пользователя, чтобы таблица не росла. */
  async deleteDeadRefreshTokens(userId: string, now = new Date()): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] },
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
