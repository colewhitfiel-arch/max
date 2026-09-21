import { Injectable } from '@nestjs/common';
import type { Role } from '@edu/contracts';
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
  teacher: { select: { id: true, schoolId: true } },
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

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
