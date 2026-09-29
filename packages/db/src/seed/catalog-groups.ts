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

  const lessons = materializeDemoLessons(now);
  for (const lesson of lessons) {
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

  // Занятия из правил создаёт api (job schedule.materialize, docs/04) и занятые слоты обходит.
  // Разовые демо-занятия плавают относительно `now` и при повторном seed могут лечь на уже
  // созданное занятие из правила — его удаляем вместе с отметками, иначе у преподавателя (и
  // у общего ученика) два занятия в одно время (docs/04 §4.5 п. 9). Только неотменённые занятия
  // демо-правил любой демо-группы того же преподавателя под демо-занятиями.
  const demoRuleIds = demoScheduleRules.map((rule) => rule.id);
  const teacherOf = new Map(demoGroups.map((group) => [group.id, group.teacherId]));
  for (const lesson of lessons) {
    const teacherId = teacherOf.get(lesson.groupId);
    await prisma.lesson.deleteMany({
      where: {
        groupId: {
          in: demoGroups.filter((group) => group.teacherId === teacherId).map((group) => group.id),
        },
        ruleId: { in: demoRuleIds },
        status: { not: 'CANCELLED' },
        startsAt: { lt: lesson.endsAt },
        endsAt: { gt: lesson.startsAt },
      },
    });
  }
}
