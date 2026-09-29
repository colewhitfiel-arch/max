import {
  demoCatalogUsers,
  demoParentLinks,
  demoParents,
  demoSchool,
  demoStudents,
  demoTeacherContacts,
  demoTeachers,
  demoUsers,
} from '@edu/contracts/fixtures';
import type { PrismaClient } from '../../generated/client';

export async function seedIdentity(prisma: PrismaClient): Promise<void> {
  await prisma.school.upsert({
    where: { id: demoSchool.id },
    create: {
      id: demoSchool.id,
      name: demoSchool.name,
      timezone: demoSchool.timezone,
      inviteCode: 'SCHOOL1',
      settings: demoSchool.settings,
    },
    update: { name: demoSchool.name, timezone: demoSchool.timezone, settings: demoSchool.settings },
  });

  // Преподаватели каталога — обычные пользователи, только не в списке dev-входа.
  for (const user of [...Object.values(demoUsers), ...demoCatalogUsers]) {
    const data = {
      maxUserId: user.maxUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      theme: user.theme,
    };
    // Демо-пользователь мог войти до первого seed (dev-вход) и получить случайный id: освобождаем
    // его maxUserId, иначе upsert по фиксированному id упадёт на уникальности (P2002) и сломает деплой.
    const occupied = await prisma.user.findUnique({ where: { maxUserId: user.maxUserId } });
    if (occupied && occupied.id !== user.id) {
      await prisma.user.update({
        where: { id: occupied.id },
        data: { maxUserId: `${user.maxUserId}#orphan-${occupied.id}` },
      });
    }
    await prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
    for (const role of user.roles) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role } },
        create: { userId: user.id, role },
        update: {},
      });
    }
    await prisma.notificationSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  for (const teacher of demoTeachers) {
    const contacts = demoTeacherContacts[teacher.id] ?? { phone: null, email: null };
    const data = {
      userId: teacher.userId,
      schoolId: teacher.schoolId,
      qualification: teacher.qualification,
      bio: teacher.bio,
      photoUrl: teacher.photoUrl,
      contactsVisible: teacher.contactsVisible,
      subjects: teacher.subjects,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
    };
    await prisma.teacherProfile.upsert({
      where: { id: teacher.id },
      create: { id: teacher.id, ...data },
      update: data,
    });
  }

  for (const student of demoStudents) {
    const data = {
      userId: student.userId,
      schoolId: student.schoolId,
      classLabel: student.classLabel,
      birthYear: student.birthYear,
      interests: student.interests,
      goals: student.goals,
      weeklyHours: student.weeklyHours,
      preferredFormats: student.preferredFormats,
      futureInterests: student.futureInterests,
      aiProfileSummary: student.aiProfileSummary,
      onboardingCompletedAt: student.onboardingCompletedAt,
      linkCode: student.linkCode,
    };
    await prisma.studentProfile.upsert({
      where: { id: student.id },
      create: { id: student.id, ...data },
      update: data,
    });
  }

  for (const parent of demoParents) {
    await prisma.parentProfile.upsert({
      where: { id: parent.id },
      create: { id: parent.id, userId: parent.userId },
      update: { userId: parent.userId },
    });
  }

  for (const link of demoParentLinks) {
    await prisma.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId: link.parentId, studentId: link.studentId } },
      create: {
        parentId: link.parentId,
        studentId: link.studentId,
        status: link.status,
        requestedAt: link.requestedAt,
        confirmedAt: link.confirmedAt,
      },
      update: { status: link.status },
    });
  }
}
