/**
 * Дашборды: главная ученика/родителя/преподавателя, группы, карточка ученика; аналитика заданий
 * родителя (прогресс за окно, сетка статусов, задания группы — `../homework.ts`); успеваемость у
 * преподавателя (ученик, задания ученика, «Общая успеваемость» — `../teacher-performance.ts`).
 */
import {
  ChildAnalyticsDtoSchema,
  ChildHomeworkProgressSchema,
  GroupDetailSchema,
  GroupHomeworkTasksSchema,
  HomeworkProgressQuerySchema,
  type Lesson,
  ParentHomeDtoSchema,
  StudentHomeDtoSchema,
  StudentProfileDtoSchema,
  TeacherGroupsListSchema,
  TeacherHomeDtoSchema,
  TeacherPerformanceDtoSchema,
  TeacherPerformanceQuerySchema,
  TeacherStudentCardSchema,
  type WeekDay,
} from '@edu/contracts';
import { demoSchool } from '@edu/contracts/fixtures';
import { http } from 'msw';
import {
  assignmentBrief,
  assignmentsOfStudent,
  clubProgress,
  gamification,
  groupBrief,
  groupCard,
  groupIdsOfStudent,
  groupsOfTeacher,
  inPeriod,
  isDone,
  lessonDto,
  lessonsOfGroups,
  needsAttention,
  scheduleOfGroup,
  sharedGroupIds,
  splitLessons,
  statsBrief,
  studentBrief,
  studentIdsOfGroup,
  userBrief,
  weeklyPoints,
} from '../demo';
import { addDays, isSameDay, startOfDay, toDateOnly } from '@/shared/lib/dates';
import {
  clubHomeworkOf,
  homeworkProgress,
  homeworkTaskDetails,
  studentClubHomework,
  sumCounts,
} from '../homework';
import { apiError, apiUrl, authed, denyForeignChild, json, periodQuery, query } from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';
import { teacherPerformance } from '../teacher-performance';

const aiText = (text: string) => ({
  text,
  generatedAt: new Date(Date.now() - 3_600_000).toISOString(),
});

/**
 * Текущая неделя пн–вс: статус дня по занятиям ученика и его посещаемости (заглушка analytics).
 * `lessons` — занятия нужных групп: все группы ученика или только группы преподавателя.
 */
function weekOfStudent(studentId: string, lessons: Lesson[], now = new Date()): WeekDay[] {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    // Отменённые занятия дня не делают его «с занятиями».
    const dayLessons = lessons.filter(
      (l) => l.status !== 'CANCELLED' && isSameDay(l.startsAt, date),
    );
    const attendance = dayLessons
      .map((l) => db.attendance.find((a) => a.lessonId === l.id && a.studentId === studentId))
      .filter((a) => a !== undefined);
    let status: WeekDay['status'];
    if (isSameDay(date, today)) status = 'TODAY';
    else if (dayLessons.length === 0) status = 'NO_LESSONS';
    else if (date > today) status = 'UPCOMING';
    else if (attendance.some((a) => a.status === 'ABSENT' || a.status === 'EXCUSED'))
      status = 'MISSED';
    else if (attendance.length > 0) status = 'ATTENDED';
    else status = 'NO_LESSONS';
    return { date: toDateOnly(date), status };
  });
}

export const dashboardsHandlers = [
  http.get(
    apiUrl('/student/home'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const groupIds = groupIdsOfStudent(student.id);
        const lessons = lessonsOfGroups(groupIds);
        const { today, upcoming } = splitLessons(lessons);
        // Открытые задания по дедлайну (без срока — в конце), не больше 10 — как в контракте.
        const dueMs = (dueAt: string | null) =>
          dueAt ? Date.parse(dueAt) : Number.POSITIVE_INFINITY;
        const tasks = assignmentsOfStudent(student.id)
          .filter((a) => !isDone(a.id, student.id))
          .map((a) => assignmentBrief(a.id, student.id))
          .sort((a, b) => dueMs(a.dueAt) - dueMs(b.dueAt))
          .slice(0, 10);
        const stats = statsBrief(student.id);
        return json(StudentHomeDtoSchema, {
          today: today.map((l) => lessonDto(l, student.id)),
          upcoming: upcoming.map((l) => lessonDto(l, student.id)),
          tasks,
          stats,
          clubs: groupIds.map((g) => clubProgress(student.id, g)),
          aiComment: student.aiProfileSummary
            ? aiText(
                'Сегодня занятие по робототехнике — не забудь про датчики. До пятницы стоит сдать задачи по Python.',
              )
            : null,
          week: weekOfStudent(student.id, lessons),
          // Серия и кристаллы по правилам analytics (docs/04 §4.6).
          ...gamification(student.id),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get(
    apiUrl('/student/profile'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const stats = statsBrief(student.id);
        const groupIds = groupIdsOfStudent(student.id);
        const clubHomework = studentClubHomework(student.id);
        return json(StudentProfileDtoSchema, {
          user: userBrief(auth.user.id),
          classLabel: student.classLabel,
          school: student.schoolId ? { id: demoSchool.id, name: demoSchool.name } : null,
          clubs: groupIds.map((g) => clubProgress(student.id, g)),
          stats,
          interests: student.interests,
          goals: student.goals,
          // Серия и кристаллы — как на главной, по правилам analytics (docs/04 §4.6).
          ...gamification(student.id),
          // «Успеваемость»: неделя посещений и задания по кружкам (docs/04 §4.6).
          week: weekOfStudent(student.id, lessonsOfGroups(groupIds)),
          homework: sumCounts(clubHomework.map((item) => item.counts)),
          clubHomework,
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/home'),
    authed(
      ({ auth, params }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        const studentId = params.studentId;
        const lessons = lessonsOfGroups(groupIdsOfStudent(studentId));
        const { today, upcoming } = splitLessons(lessons);
        const now = Date.now();
        const missed = lessons.filter(
          (l) =>
            now - new Date(l.startsAt).getTime() < 14 * 86_400_000 &&
            db.attendance.some(
              (a) => a.lessonId === l.id && a.studentId === studentId && a.status === 'ABSENT',
            ),
        );
        const assignments = assignmentsOfStudent(studentId).map((a) =>
          assignmentBrief(a.id, studentId),
        );
        return json(ParentHomeDtoSchema, {
          student: studentBrief(studentId),
          today: today.map((l) => lessonDto(l, studentId)),
          upcoming: upcoming.map((l) => lessonDto(l, studentId)),
          missed: missed.map((l) => lessonDto(l, studentId)),
          newAssignments: assignments.filter((a) => !a.submission),
          overdue: assignments.filter(
            (a) => a.dueAt && new Date(a.dueAt).getTime() < now && !a.submission,
          ),
          stats: statsBrief(studentId),
          trend: { attendanceDelta: 0.05, completionDelta: -0.1 },
          aiSummary: aiText(
            'За две недели ребёнок посетил все занятия по робототехнике и сдал задание по Python на 85 баллов.',
          ),
        });
      },
      ['PARENT'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/analytics'),
    authed(
      ({ auth, params, request }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        const studentId = params.studentId;
        const q = periodQuery(request);
        if (!q.ok) return q.response;
        const allLessons = lessonsOfGroups(groupIdsOfStudent(studentId));
        const lessons = inPeriod(allLessons, q.data.from, q.data.to);
        const clubHomework = clubHomeworkOf(studentId);
        // Сдачи без задания (удалено) пропускаем — assignmentBrief для них бросает.
        const graded = db.submissions.filter(
          (s) =>
            s.studentId === studentId &&
            s.status === 'GRADED' &&
            db.assignments.some((a) => a.id === s.assignmentId),
        );
        return json(ChildAnalyticsDtoSchema, {
          stats: statsBrief(studentId),
          clubs: groupIdsOfStudent(studentId).map((g) => clubProgress(studentId, g)),
          weekly: weeklyPoints(),
          recentResults: graded.map((s) => {
            const assignment = assignmentBrief(s.assignmentId, studentId);
            return {
              assignment,
              score: s.score ?? 0,
              maxScore: assignment.maxScore,
              submittedAt: s.submittedAt ?? s.gradedAt ?? new Date().toISOString(),
              isLate: s.isLate,
            };
          }),
          attendanceHistory: lessons.flatMap((l) => {
            const dto = lessonDto(l, studentId);
            return dto.attendance ? [{ lesson: dto, status: dto.attendance }] : [];
          }),
          aiSummary: aiText(
            'Посещаемость стабильная, выполнение заданий растёт. Стоит обратить внимание на дедлайны по Python.',
          ),
          // Экран «Успеваемость»: дуга недели, круговая диаграмма и сетки по кружкам.
          week: weekOfStudent(studentId, allLessons),
          homework: sumCounts(clubHomework.map((c) => c.counts)),
          clubHomework,
        });
      },
      ['PARENT'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/homework-progress'),
    authed(
      ({ auth, params, request }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        const q = HomeworkProgressQuerySchema.safeParse(Object.fromEntries(query(request)));
        if (!q.success) {
          return apiError('VALIDATION', 'Неверные параметры запроса', q.error.flatten());
        }
        return json(ChildHomeworkProgressSchema, homeworkProgress(params.studentId, q.data.days));
      },
      ['PARENT'],
    ),
  ),

  http.get<{ studentId: string; groupId: string }>(
    apiUrl('/parent/children/:studentId/groups/:groupId/tasks'),
    authed(
      ({ auth, params }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        if (!groupIdsOfStudent(params.studentId).includes(params.groupId)) {
          return apiError('NOT_FOUND', 'Ребёнок не занимается в этой группе');
        }
        return json(GroupHomeworkTasksSchema, {
          group: groupBrief(params.groupId),
          items: homeworkTaskDetails(params.studentId, params.groupId),
        });
      },
      ['PARENT'],
    ),
  ),

  http.get(
    apiUrl('/teacher/home'),
    authed(
      ({ auth }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const groups = groupsOfTeacher(teacher.id);
        const groupIds = groups.map((g) => g.id);
        const { today, upcoming } = splitLessons(lessonsOfGroups(groupIds));
        const cards = groupIds.map(groupCard);
        const studentIds = [...new Set(groupIds.flatMap(studentIdsOfGroup))];
        const toGrade = db.assignments
          .filter((a) => groupIds.includes(a.groupId))
          .map((a) => ({
            assignment: assignmentBrief(a.id),
            pendingCount: db.submissions.filter(
              (s) => s.assignmentId === a.id && s.status === 'SUBMITTED',
            ).length,
          }))
          .filter((x) => x.pendingCount > 0);
        const avg = (values: (number | null)[]) => {
          const nums = values.filter((v): v is number => v !== null);
          return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        };
        return json(TeacherHomeDtoSchema, {
          today: today.map((l) => lessonDto(l)),
          upcoming: upcoming.map((l) => lessonDto(l)),
          groups: cards,
          toGrade,
          // Последние 5 уведомлений — свежие первыми, как в ленте (`/notifications`).
          events: db.notifications
            .filter((n) => n.userId === auth.user.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 5)
            .map(({ userId: _userId, ...n }) => n),
          stats: {
            groupsCount: groups.length,
            studentsCount: studentIds.length,
            avgAttendanceRate: avg(cards.map((c) => c.attendanceRate)),
            avgCompletionRate: avg(cards.map((c) => c.completionRate)),
            needsAttentionCount: studentIds.filter((id) => needsAttention(id).length > 0).length,
          },
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get(
    apiUrl('/teacher/groups'),
    authed(
      ({ auth }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        return json(TeacherGroupsListSchema, {
          items: groupsOfTeacher(teacher.id).map((g) => groupCard(g.id)),
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ groupId: string }>(
    apiUrl('/teacher/groups/:groupId'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const group = db.groups.find((g) => g.id === params.groupId);
        // «Нет такой» и «чужая» для преподавателя неразличимы — 403 (docs/05); 404 фронт
        // показывает как «раздел в разработке».
        if (!group || !teacher || group.teacherId !== teacher.id)
          return apiError('FORBIDDEN', 'Группа не найдена или чужая');
        return json(GroupDetailSchema, {
          ...groupCard(group.id),
          schedule: scheduleOfGroup(group.id),
          // Показатели учеников — по этой группе, а не по всем их кружкам.
          students: studentIdsOfGroup(group.id).map((studentId) => {
            const stats = statsBrief(studentId, 30, group.id);
            const course = db.courses.find((c) => c.groupId === group.id);
            return {
              student: studentBrief(studentId),
              attendanceRate: stats.attendanceRate,
              completionRate: stats.completionRate,
              progress: course ? clubProgress(studentId, group.id).percent : 0,
              activityScore: stats.activityScore,
              needsAttention: needsAttention(studentId, group.id),
            };
          }),
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/teacher/students/:studentId'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const studentId = params.studentId;
        const groupIds = sharedGroupIds(teacher.id, studentId);
        // Нет такого ученика — как «не в ваших группах»: 403, а не 404 (docs/05).
        if (groupIds.length === 0) return apiError('FORBIDDEN', 'Ученик не в ваших группах');
        const lessons = lessonsOfGroups(groupIds);
        // «Успеваемость» — как у родителя, но только по группам преподавателя (docs/04 §4.6).
        const clubHomework = clubHomeworkOf(studentId, new Date(), { groupIds, viewer: 'teacher' });
        return json(TeacherStudentCardSchema, {
          student: studentBrief(studentId),
          groups: groupIds.map((g) => groupCard(g)),
          stats: statsBrief(studentId),
          clubs: groupIds.map((g) => clubProgress(studentId, g)),
          weekly: weeklyPoints(),
          history: db.submissions
            .filter(
              (s) =>
                s.studentId === studentId &&
                s.submittedAt &&
                db.assignments.some((a) => a.id === s.assignmentId),
            )
            .map((s) => ({
              assignment: assignmentBrief(s.assignmentId, studentId),
              score: s.score,
              isLate: s.isLate,
              submittedAt: s.submittedAt!,
            })),
          attendanceHistory: lessons.flatMap((l) => {
            const dto = lessonDto(l, studentId);
            return dto.attendance ? [{ lesson: dto, status: dto.attendance }] : [];
          }),
          aiSummary: aiText(
            'Ученик активен на практике, но не всегда укладывается в сроки домашних заданий.',
          ),
          needsAttention: needsAttention(studentId),
          week: weekOfStudent(studentId, lessons),
          homework: sumCounts(clubHomework.map((item) => item.counts)),
          clubHomework,
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ studentId: string; groupId: string }>(
    apiUrl('/teacher/students/:studentId/groups/:groupId/tasks'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const { studentId, groupId } = params;
        // Нет ученика или группы — тоже 403, как чужие (docs/05).
        const group = db.groups.find((g) => g.id === groupId);
        if (!group || group.teacherId !== teacher.id) {
          return apiError('FORBIDDEN', 'Группа не найдена или чужая');
        }
        if (!sharedGroupIds(teacher.id, studentId).includes(groupId)) {
          return apiError('FORBIDDEN', 'Ученик не в этой группе');
        }
        return json(GroupHomeworkTasksSchema, {
          group: groupBrief(groupId),
          items: homeworkTaskDetails(studentId, groupId, new Date(), 'teacher'),
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get(
    apiUrl('/teacher/performance'),
    authed(
      ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const q = TeacherPerformanceQuerySchema.safeParse(Object.fromEntries(query(request)));
        if (!q.success) {
          return apiError('VALIDATION', 'Неверные параметры запроса', q.error.flatten());
        }
        return json(TeacherPerformanceDtoSchema, teacherPerformance(teacher.id, q.data.period));
      },
      ['TEACHER'],
    ),
  ),
];
