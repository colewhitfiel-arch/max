import {
  DEMO_IDS,
  demoAssignmentDueOffsets,
  demoAssignments,
  demoAttendance,
  demoBlocks,
  demoCourse,
  demoModules,
  demoSubmissions,
} from '@edu/contracts/fixtures';
import type { Prisma, PrismaClient } from '../../generated/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function seedLearning(prisma: PrismaClient, now: Date): Promise<void> {
  for (const row of demoAttendance) {
    const data = {
      lessonId: row.lessonId,
      studentId: row.studentId,
      status: row.status,
      comment: row.comment,
      markedById: row.markedById,
      markedAt: row.markedAt,
    };
    await prisma.attendance.upsert({
      where: { id: row.id },
      create: { id: row.id, ...data },
      update: data,
    });
  }

  await prisma.course.upsert({
    where: { id: demoCourse.id },
    create: {
      id: demoCourse.id,
      groupId: demoCourse.groupId,
      teacherId: demoCourse.teacherId,
      title: demoCourse.title,
      description: demoCourse.description,
      status: demoCourse.status,
      version: demoCourse.version,
      publishedAt: demoCourse.publishedAt,
    },
    update: {
      title: demoCourse.title,
      description: demoCourse.description,
      status: demoCourse.status,
    },
  });

  for (const mod of demoModules) {
    const data = {
      courseId: mod.courseId,
      order: mod.order,
      title: mod.title,
      summary: mod.summary,
    };
    await prisma.courseModule.upsert({
      where: { id: mod.id },
      create: { id: mod.id, ...data },
      update: data,
    });
  }

  for (const block of demoBlocks) {
    const data = {
      moduleId: block.moduleId,
      order: block.order,
      type: block.type,
      title: block.title,
      content: block.content as Prisma.InputJsonValue,
      estimatedMinutes: block.estimatedMinutes,
      isRequired: block.isRequired,
    };
    await prisma.courseBlock.upsert({
      where: { id: block.id },
      create: { id: block.id, ...data },
      update: data,
    });
  }

  for (const assignment of demoAssignments) {
    const dueOffset = demoAssignmentDueOffsets[assignment.id];
    const dueAt = dueOffset === undefined ? null : new Date(now.getTime() + dueOffset * DAY_MS);
    const data = {
      groupId: assignment.groupId,
      teacherId: assignment.teacherId,
      courseId: assignment.courseId,
      blockId: assignment.blockId,
      title: assignment.title,
      description: assignment.description,
      type: assignment.type,
      dueAt,
      maxScore: assignment.maxScore,
      allowedAttempts: assignment.allowedAttempts,
      publishedAt: assignment.publishedAt,
    };
    await prisma.assignment.upsert({
      where: { id: assignment.id },
      create: { id: assignment.id, ...data },
      update: data,
    });
  }

  for (const submission of demoSubmissions) {
    const data = {
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      status: submission.status,
      attemptsCount: submission.attemptsCount,
      score: submission.score,
      answers: submission.answers as Prisma.InputJsonValue,
      fileIds: submission.fileIds,
      text: submission.text,
      submittedAt: submission.submittedAt,
      gradedAt: submission.gradedAt,
      gradedById: submission.gradedById,
      feedback: submission.feedback,
      isLate: submission.isLate,
    };
    await prisma.submission.upsert({
      where: { id: submission.id },
      create: { id: submission.id, ...data },
      update: data,
    });
  }

  // Прогресс Алексея по курсу: первый блок пройден, второй открыт.
  const alexey = DEMO_IDS.students.alexey;
  await prisma.blockProgress.upsert({
    where: { studentId_blockId: { studentId: alexey, blockId: DEMO_IDS.blocks.introText } },
    create: {
      studentId: alexey,
      blockId: DEMO_IDS.blocks.introText,
      status: 'COMPLETED',
      completedAt: new Date(now.getTime() - 2 * DAY_MS),
    },
    update: { status: 'COMPLETED' },
  });
  await prisma.blockProgress.upsert({
    where: { studentId_blockId: { studentId: alexey, blockId: DEMO_IDS.blocks.introVideo } },
    create: { studentId: alexey, blockId: DEMO_IDS.blocks.introVideo, status: 'OPENED' },
    update: {},
  });
  await prisma.courseProgress.upsert({
    where: { studentId_courseId: { studentId: alexey, courseId: DEMO_IDS.course } },
    create: {
      studentId: alexey,
      courseId: DEMO_IDS.course,
      completedBlocks: 1,
      totalBlocks: demoBlocks.length,
      percent: Math.round((1 / demoBlocks.length) * 100),
      lastActivityAt: new Date(now.getTime() - 2 * DAY_MS),
    },
    update: { totalBlocks: demoBlocks.length },
  });
}
