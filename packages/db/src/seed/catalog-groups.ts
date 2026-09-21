import {
  demoClubs,
  demoEnrollments,
  demoGroups,
  demoScheduleRules,
  materializeDemoLessons,
} from '@edu/contracts/fixtures';
import type { PrismaClient } from '../../generated/client';

export async function seedCatalogAndGroups(prisma: PrismaClient, now: Date): Promise<void> {
  for (const club of demoClubs) {
    const data = {
      schoolId: club.schoolId,
      title: club.title,
      description: club.description,
      category: club.category,
      coverUrl: club.coverUrl,
      priceKopecks: club.price.amountKopecks,
      billingPeriod: club.billingPeriod,
      isActive: club.isActive,
      tags: club.tags,
    };
    await prisma.club.upsert({
      where: { id: club.id },
      create: { id: club.id, ...data },
      update: data,
    });
  }

  for (const group of demoGroups) {
    const data = {
      clubId: group.clubId,
      teacherId: group.teacherId,
      title: group.title,
      isActive: group.isActive,
    };
    await prisma.group.upsert({
      where: { id: group.id },
      create: { id: group.id, ...data },
      update: data,
    });
  }

  for (const enrollment of demoEnrollments) {
    const data = {
      studentId: enrollment.studentId,
      groupId: enrollment.groupId,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      leftAt: enrollment.leftAt,
    };
    await prisma.enrollment.upsert({
      where: { id: enrollment.id },
      create: { id: enrollment.id, ...data },
      update: data,
    });
  }

  for (const rule of demoScheduleRules) {
    const data = {
      groupId: rule.groupId,
      weekday: rule.weekday,
      startTime: rule.startTime,
      endTime: rule.endTime,
      room: rule.room,
      validFrom: new Date(rule.validFrom),
      validTo: rule.validTo ? new Date(rule.validTo) : null,
    };
    await prisma.scheduleRule.upsert({
      where: { id: rule.id },
      create: { id: rule.id, ...data },
      update: data,
    });
  }

  for (const lesson of materializeDemoLessons(now)) {
    const data = {
      groupId: lesson.groupId,
      ruleId: lesson.ruleId,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      topic: lesson.topic,
      room: lesson.room,
      status: lesson.status,
      cancelReason: lesson.cancelReason,
    };
    await prisma.lesson.upsert({
      where: { id: lesson.id },
      create: { id: lesson.id, ...data },
      update: data,
    });
  }
}
