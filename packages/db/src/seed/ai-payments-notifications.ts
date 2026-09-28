import {
  demoClubInterests,
  demoConversation,
  demoMessages,
  demoNotification,
  demoNotificationUserId,
  materializeDemoPaidPeriod,
  materializeDemoPayment,
  materializeDemoRoleNotifications,
  materializeDemoWalletIncome,
} from '@edu/contracts/fixtures';
import type { Prisma, PrismaClient } from '../../generated/client';

export async function seedAiPaymentsNotifications(prisma: PrismaClient, now: Date): Promise<void> {
  await prisma.aiConversation.upsert({
    where: { id: demoConversation.id },
    create: {
      id: demoConversation.id,
      userId: demoConversation.userId,
      studentId: demoConversation.studentId,
      kind: demoConversation.kind,
      title: demoConversation.title,
      lastMessageAt: demoConversation.lastMessageAt,
      createdAt: demoConversation.createdAt,
    },
    update: { title: demoConversation.title },
  });
  for (const message of demoMessages) {
    await prisma.aiMessage.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      },
      update: { content: message.content },
    });
  }

  // Спрос на кружки из онбординга Алексея. Ключ — пара ученик–кружок (как у онбординга): строка
  // могла появиться при повторном онбординге через api с другим id.
  for (const interest of demoClubInterests) {
    const data = {
      status: interest.status,
      score: interest.score,
      reason: interest.reason,
      source: 'ONBOARDING',
    };
    await prisma.studentClubInterest.upsert({
      where: {
        studentId_clubId: { studentId: interest.studentId, clubId: interest.clubId },
      },
      create: { id: interest.id, studentId: interest.studentId, clubId: interest.clubId, ...data },
      update: data,
    });
  }

  // Даты оплаты — относительно `now`, как у занятий: оплаченный период не «протухает».
  const demoPayment = materializeDemoPayment(now);
  const demoPaidPeriod = materializeDemoPaidPeriod(now);
  await prisma.payment.upsert({
    where: { id: demoPayment.id },
    create: {
      id: demoPayment.id,
      parentId: demoPayment.parentId,
      studentId: demoPayment.studentId,
      enrollmentId: demoPayment.enrollmentId,
      amountKopecks: demoPayment.amount.amountKopecks,
      currency: demoPayment.amount.currency,
      status: demoPayment.status,
      provider: demoPayment.provider,
      providerPaymentId: `fake-${demoPayment.id}`,
      confirmationUrl: demoPayment.confirmationUrl,
      periodsCount: demoPayment.periodsCount,
      idempotencyKey: `seed-${demoPayment.id}`,
      paidAt: demoPayment.paidAt,
      failReason: demoPayment.failReason,
      createdAt: demoPayment.createdAt,
    },
    update: {
      status: demoPayment.status,
      paidAt: demoPayment.paidAt,
      createdAt: demoPayment.createdAt,
    },
  });
  const periodDates = {
    periodStart: new Date(demoPaidPeriod.periodStart),
    periodEnd: new Date(demoPaidPeriod.periodEnd),
  };
  await prisma.paidPeriod.upsert({
    where: { id: demoPaidPeriod.id },
    create: {
      id: demoPaidPeriod.id,
      enrollmentId: demoPaidPeriod.enrollmentId,
      ...periodDates,
      paymentId: demoPaidPeriod.paymentId,
    },
    update: periodDates,
  });
  // Закрытая оплата — поступление преподавателю группы (как PaymentsRepository.settle).
  const income = materializeDemoWalletIncome(now);
  const incomeData = {
    teacherId: income.teacherId,
    kind: income.kind,
    amountKopecks: income.amount.amountKopecks,
    currency: income.amount.currency,
    groupId: income.groupId,
    studentId: income.studentId,
    paymentId: income.paymentId,
    at: income.at,
  };
  await prisma.teacherWalletTransaction.upsert({
    where: { id: income.id },
    create: { id: income.id, ...incomeData },
    update: incomeData,
  });

  await prisma.notification.upsert({
    where: { id: demoNotification.id },
    create: {
      id: demoNotification.id,
      userId: demoNotificationUserId,
      type: demoNotification.type,
      title: demoNotification.title,
      body: demoNotification.body,
      payload: demoNotification.payload as Prisma.InputJsonValue,
      readAt: demoNotification.readAt,
      createdAt: demoNotification.createdAt,
    },
    update: { title: demoNotification.title },
  });

  // Уведомления родителя и преподавателя: время — как у события, прочитанность не трогаем.
  for (const { userId, ...notification } of materializeDemoRoleNotifications(now)) {
    const data = {
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payload as Prisma.InputJsonValue,
      createdAt: notification.createdAt,
    };
    await prisma.notification.upsert({
      where: { id: notification.id },
      create: { id: notification.id, userId, readAt: notification.readAt, ...data },
      update: data,
    });
  }
}
