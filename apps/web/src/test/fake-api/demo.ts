/**
 * Сборка DTO контракта из демо-мира (`state.ts`): brief'ы, занятия с посещаемостью,
 * задания со сдачами, статистика. Цифры статистики — правдоподобные заглушки, не формулы analytics.
 */
import type {
  Assignment,
  AssignmentBrief,
  ClubBrief,
  ClubCard,
  ClubProgress,
  GroupBrief,
  GroupCard,
  Lesson,
  LessonDto,
  MeDto,
  Role,
  ScheduleRuleDto,
  StatsBrief,
  StudentBrief,
  TeacherBrief,
  UserBrief,
  WeeklyPoint,
} from '@edu/contracts';
import { demoAssignmentDueOffsets, demoSchool, demoTeacherContacts } from '@edu/contracts/fixtures';
import { addDays, isSameDay, startOfDay, toDateOnly } from '@/shared/lib/dates';
import { db, type MockUser, parentOfUser, studentOfUser, teacherOfUser } from './state';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function userBrief(userId: string): UserBrief {
  const user = db.users.get(userId);
  if (!user) throw new Error(`mock: нет пользователя ${userId}`);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

export function studentBrief(studentId: string): StudentBrief {
  const profile = db.students.find((s) => s.id === studentId);
  if (!profile) throw new Error(`mock: нет ученика ${studentId}`);
  return { id: profile.id, user: userBrief(profile.userId), classLabel: profile.classLabel };
}

export function teacherBrief(teacherId: string): TeacherBrief {
  const profile = db.teachers.find((t) => t.id === teacherId);
  if (!profile) throw new Error(`mock: нет преподавателя ${teacherId}`);
  return { id: profile.id, user: userBrief(profile.userId), photoUrl: profile.photoUrl };
}

export function clubBrief(clubId: string): ClubBrief {
  const club = db.clubs.find((c) => c.id === clubId);
  if (!club) throw new Error(`mock: нет кружка ${clubId}`);
  return { id: club.id, title: club.title, category: club.category, coverUrl: club.coverUrl };
}

export function groupBrief(groupId: string): GroupBrief {
  const group = db.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`mock: нет группы ${groupId}`);
  return {
    id: group.id,
    title: group.title,
    // Короткий номер («001») — только в моках (`MOCK_GROUP_CODES`), везде, где есть GroupBrief.
    code: group.code,
    club: clubBrief(group.clubId),
    teacher: teacherBrief(group.teacherId),
  };
}

export function scheduleOfGroup(groupId: string): ScheduleRuleDto[] {
  return db.scheduleRules
    .filter((rule) => rule.groupId === groupId)
    .map(({ id, weekday, startTime, endTime, room }) => ({
      id,
      weekday,
      startTime,
      endTime,
      room,
    }));
}

export function schedulePreview(clubId: string): string[] {
  return db.groups
    .filter((g) => g.clubId === clubId)
    .flatMap((g) => scheduleOfGroup(g.id))
    .map((rule) => `${WEEKDAYS[rule.weekday]} ${rule.startTime}–${rule.endTime}`);
}

export function clubCard(clubId: string): ClubCard {
  const club = db.clubs.find((c) => c.id === clubId);
  if (!club) throw new Error(`mock: нет кружка ${clubId}`);
  const teacherIds = [
    ...new Set(db.groups.filter((g) => g.clubId === clubId).map((g) => g.teacherId)),
  ];
  return {
    ...clubBrief(clubId),
    description: club.description,
    price: club.price,
    billingPeriod: club.billingPeriod,
    tags: club.tags,
    teachers: teacherIds.map(teacherBrief),
    schedulePreview: schedulePreview(clubId),
  };
}

export const teacherContacts = (teacherId: string) =>
  demoSchool.settings.showTeacherContacts &&
  db.teachers.find((t) => t.id === teacherId)?.contactsVisible
    ? (demoTeacherContacts[teacherId] ?? null)
    : null;

// ---------- Связи ----------

export const enrollmentsOfStudent = (studentId: string) =>
  db.enrollments.filter((e) => e.studentId === studentId && e.status === 'ACTIVE');

export const groupIdsOfStudent = (studentId: string) =>
  enrollmentsOfStudent(studentId).map((e) => e.groupId);

export const studentIdsOfGroup = (groupId: string) =>
  db.enrollments
    .filter((e) => e.groupId === groupId && e.status === 'ACTIVE')
    .map((e) => e.studentId);

export const groupsOfTeacher = (teacherId: string) =>
  db.groups.filter((g) => g.teacherId === teacherId);

/** Группы преподавателя, в которых занимается ученик (политика доступа `teacher:students.view`). */
export const sharedGroupIds = (teacherId: string, studentId: string) => {
  const own = new Set(groupsOfTeacher(teacherId).map((g) => g.id));
  return groupIdsOfStudent(studentId).filter((groupId) => own.has(groupId));
};

export const childrenIdsOfParent = (parentId: string) =>
  db.links.filter((l) => l.parentId === parentId && l.status === 'ACTIVE').map((l) => l.studentId);

// ---------- Занятия ----------

export function lessonDto(lesson: Lesson, studentId?: string): LessonDto {
  const attendance = studentId
    ? (db.attendance.find((a) => a.lessonId === lesson.id && a.studentId === studentId)?.status ??
      null)
    : undefined;
  return { ...lesson, group: groupBrief(lesson.groupId), ...(studentId ? { attendance } : {}) };
}

export const lessonsOfGroups = (groupIds: string[]) =>
  db.lessons
    .filter((l) => groupIds.includes(l.groupId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

export function inPeriod(lessons: Lesson[], from?: string | null, to?: string | null): Lesson[] {
  const fromDate = from ?? toDateOnly(addDays(new Date(), -30));
  const toDate = to ?? toDateOnly(new Date());
  return lessons.filter((l) => {
    const day = toDateOnly(l.startsAt);
    return day >= fromDate && day <= toDate;
  });
}

export function splitLessons(lessons: Lesson[], now = new Date()) {
  const today = lessons.filter((l) => isSameDay(l.startsAt, now));
  const upcoming = lessons
    .filter((l) => {
      const start = new Date(l.startsAt).getTime();
      return (
        !isSameDay(l.startsAt, now) && start > now.getTime() && start < now.getTime() + 7 * DAY_MS
      );
    })
    .slice(0, 10);
  return { today, upcoming };
}

// ---------- Задания ----------

/**
 * Срок задания: сохранённый `dueAt` (создание/PATCH преподавателем), иначе — смещение демо-задания
 * от «сегодня» (у фикстур `dueAt: null`, срок относительный).
 */
export function dueAtOf(assignment: Pick<Assignment, 'id' | 'dueAt'>): string | null {
  if (assignment.dueAt) return assignment.dueAt;
  const offset = demoAssignmentDueOffsets[assignment.id];
  if (offset === undefined) return null;
  const due = addDays(new Date(), offset);
  due.setHours(23, 59, 0, 0);
  return due.toISOString();
}

export function assignmentBrief(assignmentId: string, studentId?: string): AssignmentBrief {
  const assignment = db.assignments.find((a) => a.id === assignmentId);
  if (!assignment) throw new Error(`mock: нет задания ${assignmentId}`);
  const submission = studentId
    ? db.submissions.find((s) => s.assignmentId === assignmentId && s.studentId === studentId)
    : undefined;
  return {
    id: assignment.id,
    title: assignment.title,
    type: assignment.type,
    dueAt: dueAtOf(assignment),
    maxScore: assignment.maxScore,
    group: groupBrief(assignment.groupId),
    submission: submission
      ? {
          status: submission.status,
          score: submission.score,
          isLate: submission.isLate,
          submittedAt: submission.submittedAt,
        }
      : null,
  };
}

/**
 * Задания, доступные ученику: опубликованные задания его групп, адресованные всей группе
 * (пустой `studentIds`) или лично ему.
 */
export const assignmentsOfStudent = (studentId: string) => {
  const groupIds = groupIdsOfStudent(studentId);
  return db.assignments.filter(
    (a) =>
      groupIds.includes(a.groupId) &&
      a.publishedAt &&
      (a.studentIds.length === 0 || a.studentIds.includes(studentId)),
  );
};

/** Кому адресовано задание: перечисленные ученики или весь состав группы. */
export const targetIdsOfAssignment = (assignmentId: string): string[] => {
  const assignment = db.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return [];
  const roster = studentIdsOfGroup(assignment.groupId);
  return assignment.studentIds.length === 0
    ? roster
    : roster.filter((id) => assignment.studentIds.includes(id));
};

export const isDone = (assignmentId: string, studentId: string) => {
  const s = db.submissions.find(
    (x) => x.assignmentId === assignmentId && x.studentId === studentId,
  );
  return !!s && (s.status === 'SUBMITTED' || s.status === 'GRADED');
};

// ---------- Статистика (заглушки) ----------

/**
 * Статистика ученика; с `groupId` — только по занятиям и заданиям этой группы (карточки кружков
 * и групп), без него — по всем группам ученика.
 */
export function statsBrief(studentId: string, days = 30, groupId?: string): StatsBrief {
  const records = db.attendance.filter(
    (a) =>
      a.studentId === studentId &&
      (groupId === undefined || db.lessons.find((l) => l.id === a.lessonId)?.groupId === groupId),
  );
  const countable = records.length;
  const present = records.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
  const assignments = assignmentsOfStudent(studentId).filter(
    (a) => groupId === undefined || a.groupId === groupId,
  );
  const done = assignments.filter((a) => isDone(a.id, studentId)).length;
  return {
    attendanceRate: countable ? present / countable : null,
    completionRate: assignments.length ? done / assignments.length : null,
    activityScore: Math.min(100, 40 + present * 15 + done * 10),
    absences: records.filter((a) => a.status === 'ABSENT').length,
    lateCount: records.filter((a) => a.status === 'LATE').length,
    period: { from: toDateOnly(addDays(new Date(), -(days - 1))), to: toDateOnly(new Date()) },
  };
}

/**
 * Серия и кристаллы ученика — фейковый сервер повторяет правила analytics
 * (`apps/api/src/modules/analytics/gamification.ts`, docs/04 §4.6):
 * серия — дни от начала до последнего действия (посещение или сданное задание), действие
 * нужно хотя бы раз в 2 дня; кристаллы — 50 за посещение + 20 за задание больше 75%.
 */
export function gamification(studentId: string): { streakDays: number; points: number } {
  const attended = db.attendance.filter(
    (a) => a.studentId === studentId && (a.status === 'PRESENT' || a.status === 'LATE'),
  );
  const submissions = db.submissions.filter((s) => s.studentId === studentId && s.submittedAt);
  const activeDays = [
    ...attended.flatMap((a) => {
      const lesson = db.lessons.find((l) => l.id === a.lessonId);
      return lesson ? [toDateOnly(lesson.startsAt)] : [];
    }),
    ...submissions.map((s) => toDateOnly(s.submittedAt!)),
  ];
  const today = startOfDay();
  const days = [...new Set(activeDays)]
    .map((day) => Math.round((startOfDay(day).getTime() - today.getTime()) / 86_400_000))
    .filter((offset) => offset <= 0)
    .sort((a, b) => b - a);
  let streakDays = 0;
  const last = days[0];
  if (last !== undefined && -last <= 2) {
    let start = last;
    for (const day of days.slice(1)) {
      if (start - day > 2) break;
      start = day;
    }
    streakDays = last - start + 1;
  }
  const passed = submissions.filter((s) => {
    const assignment = db.assignments.find((a) => a.id === s.assignmentId);
    return assignment && s.score !== null && s.score / assignment.maxScore > 0.75;
  }).length;
  return { streakDays, points: attended.length * 50 + passed * 20 };
}

export function clubProgress(studentId: string, groupId: string): ClubProgress {
  const group = groupBrief(groupId);
  const course = db.courses.find((c) => c.groupId === groupId && c.status === 'PUBLISHED');
  const percent = course ? courseProgressPercent(course.id, studentId) : 0;
  const stats = statsBrief(studentId, 30, groupId);
  return {
    club: group.club,
    group,
    percent,
    attendanceRate: stats.attendanceRate,
    completionRate: stats.completionRate,
  };
}

export function courseProgressPercent(courseId: string, studentId: string): number {
  const blockIds = db.modules
    .filter((m) => m.courseId === courseId)
    .flatMap((m) => db.blocks.filter((b) => b.moduleId === m.id).map((b) => b.id));
  if (blockIds.length === 0) return 0;
  const completed = db.blockProgress.filter(
    (p) => p.studentId === studentId && blockIds.includes(p.blockId) && p.status === 'COMPLETED',
  ).length;
  return Math.round((completed / blockIds.length) * 100);
}

export function weeklyPoints(weeks = 4): WeeklyPoint[] {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(monday, -7 * (weeks - 1 - i));
    return {
      weekStart: toDateOnly(start),
      attendanceRate: [0.75, 1, 0.5, 1][i % 4] ?? null,
      completionRate: [0.5, 0.67, 0.67, 1][i % 4] ?? null,
      activityScore: [55, 70, 60, 85][i % 4] ?? 60,
    };
  });
}

export function groupCard(groupId: string): GroupCard {
  const brief = groupBrief(groupId);
  const studentIds = studentIdsOfGroup(groupId);
  const stats = studentIds.map((id) => statsBrief(id, 30, groupId));
  const avg = (values: (number | null)[]) => {
    const nums = values.filter((v): v is number => v !== null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const now = new Date();
  const nextLesson =
    lessonsOfGroups([groupId]).find(
      (l) => new Date(l.startsAt).getTime() >= now.getTime() && l.status === 'PLANNED',
    ) ?? null;
  return {
    ...brief,
    studentsCount: studentIds.length,
    attendanceRate: avg(stats.map((s) => s.attendanceRate)),
    completionRate: avg(stats.map((s) => s.completionRate)),
    needsAttentionCount: studentIds.filter((id) => needsAttention(id, groupId).length > 0).length,
    nextLesson: nextLesson ? lessonDto(nextLesson) : null,
  };
}

/** Причины внимания к ученику; с `groupId` — только по этой группе. */
export function needsAttention(studentId: string, groupId?: string): string[] {
  const reasons: string[] = [];
  const stats = statsBrief(studentId, 30, groupId);
  if (stats.absences > 0) reasons.push('Пропуски');
  if (stats.completionRate !== null && stats.completionRate < 0.5) reasons.push('Не сдаёт задания');
  return reasons;
}

// ---------- Me ----------

export function buildMe(user: MockUser, activeRole: Role | null): MeDto {
  const student = studentOfUser(user.id);
  const parent = parentOfUser(user.id);
  const teacher = teacherOfUser(user.id);
  const settings = db.settings.get(user.id) ?? { theme: user.theme, locale: user.locale };
  return {
    user: userBrief(user.id),
    roles: [...user.roles],
    activeRole:
      activeRole && user.roles.includes(activeRole) ? activeRole : (user.roles[0] ?? null),
    needsRoleSetup: user.roles.length === 0,
    settings,
    student: student
      ? {
          id: student.id,
          onboardingCompleted: student.onboardingCompletedAt !== null,
          schoolId: student.schoolId,
          linkCode: student.linkCode,
          classLabel: student.classLabel,
        }
      : null,
    parent: parent ? { id: parent.id, childrenCount: childrenIdsOfParent(parent.id).length } : null,
    teacher: teacher
      ? {
          id: teacher.id,
          schoolId: teacher.schoolId,
          subjects: teacher.subjects,
          qualification: teacher.qualification,
        }
      : null,
  };
}
