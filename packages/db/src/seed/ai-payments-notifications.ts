import {
  demoConversation,
  demoMessages,
  demoNotification,
  demoNotificationUserId,
  demoPaidPeriod,
  demoPayment,
} from '@edu/contracts/fixtures';
import type { Prisma, PrismaClient } from '../../generated/client';

export async function seedAiPaymentsNotifications(prisma: PrismaClient): Promise<void> {
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
    update: { status: demoPayment.status },
  });
  await prisma.paidPeriod.upsert({
    where: { id: demoPaidPeriod.id },
    create: {
      id: demoPaidPeriod.id,
      enrollmentId: demoPaidPeriod.enrollmentId,
      periodStart: new Date(demoPaidPeriod.periodStart),
      periodEnd: new Date(demoPaidPeriod.periodEnd),
      paymentId: demoPaidPeriod.paymentId,
    },
    update: {},
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
}
