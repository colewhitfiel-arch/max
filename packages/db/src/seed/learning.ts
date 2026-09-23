import {
  DEMO_IDS,
  demoAssignmentDueOffsets,
  demoAssignments,
  demoAttendance,
  demoBlocks,
  demoCourse,
  demoModules,
  demoSubmissions,
  materializeDemoLessons,
} from '@edu/contracts/fixtures';
import type { Prisma, PrismaClient } from '../../generated/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Отметки посещаемости демо-мира. Время отметки — начало занятия (занятия материализуются
 * относительно `now`), а не фиксированная дата фикстуры: иначе отметка раньше самого занятия.
 */
export function demoAttendanceRows(now: Date) {
  const lessonsById = new Map(materializeDemoLessons(now).map((lesson) => [lesson.id, lesson]));
  return demoAttendance.map((row) => ({
    id: row.id,
    lessonId: row.lessonId,
    studentId: row.studentId,
    status: row.status,
    comment: row.comment,
    markedById: row.markedById,
    markedAt: lessonsById.get(row.lessonId)?.startsAt ?? row.markedAt,
  }));
}

/** Прогресс Алексея по демо-курсу: пройден один блок из всех. */
export function demoCourseProgressData(now: Date) {
  return {
    completedBlocks: 1,
    totalBlocks: demoBlocks.length,
    percent: Math.round((1 / demoBlocks.length) * 100),
    lastActivityAt: new Date(now.getTime() - 2 * DAY_MS),
  };
}

export async function seedLearning(prisma: PrismaClient, now: Date): Promise<void> {
  for (const { id, ...data } of demoAttendanceRows(now)) {
    await prisma.attendance.upsert({
      where: { id },
      create: { id, ...data },
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
  const introCompleted = {
    status: 'COMPLETED' as const,
    completedAt: new Date(now.getTime() - 2 * DAY_MS),
  };
  await prisma.blockProgress.upsert({
    where: { studentId_blockId: { studentId: alexey, blockId: DEMO_IDS.blocks.introText } },
    create: { studentId: alexey, blockId: DEMO_IDS.blocks.introText, ...introCompleted },
    update: introCompleted,
  });
  await prisma.blockProgress.upsert({
    where: { studentId_blockId: { studentId: alexey, blockId: DEMO_IDS.blocks.introVideo } },
    create: { studentId: alexey, blockId: DEMO_IDS.blocks.introVideo, status: 'OPENED' },
    update: {},
  });
  const progressData = demoCourseProgressData(now);
  await prisma.courseProgress.upsert({
    where: { studentId_courseId: { studentId: alexey, courseId: DEMO_IDS.course } },
    create: { studentId: alexey, courseId: DEMO_IDS.course, ...progressData },
    update: progressData,
  });
}
