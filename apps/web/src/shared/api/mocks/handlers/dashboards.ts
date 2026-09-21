/** Дашборды: главная ученика/родителя/преподавателя, группы, карточка ученика. */
import {
  ChildAnalyticsDtoSchema,
  GroupDetailSchema,
  ParentHomeDtoSchema,
  StudentHomeDtoSchema,
  StudentProfileDtoSchema,
  TeacherGroupsListSchema,
  TeacherHomeDtoSchema,
  TeacherStudentCardSchema,
} from '@edu/contracts';
import { demoSchool } from '@edu/contracts/fixtures';
import { http } from 'msw';
import {
  assignmentBrief,
  assignmentsOfStudent,
  childrenIdsOfParent,
  clubProgress,
  groupCard,
  groupIdsOfStudent,
  groupsOfTeacher,
  inPeriod,
  isDone,
  lessonDto,
  lessonsOfGroups,
  needsAttention,
  scheduleOfGroup,
  splitLessons,
  statsBrief,
  studentBrief,
  studentIdsOfGroup,
  userBrief,
  weeklyPoints,
} from '../demo';
import { apiError, apiUrl, authed, json, query } from '../lib';
import { db, parentOfUser, studentOfUser, teacherOfUser } from '../state';

const aiText = (text: string) => ({
  text,
  generatedAt: new Date(Date.now() - 3_600_000).toISOString(),
});

export const dashboardsHandlers = [
  http.get(
    apiUrl('/student/home'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const groupIds = groupIdsOfStudent(student.id);
        const { today, upcoming } = splitLessons(lessonsOfGroups(groupIds));
        const tasks = assignmentsOfStudent(student.id)
          .filter((a) => !isDone(a.id, student.id))
          .map((a) => assignmentBrief(a.id, student.id))
          .slice(0, 10);
        return json(StudentHomeDtoSchema, {
          today: today.map((l) => lessonDto(l, student.id)),
          upcoming: upcoming.map((l) => lessonDto(l, student.id)),
          tasks,
          stats: statsBrief(student.id),
          clubs: groupIds.map((g) => clubProgress(student.id, g)),
          aiComment: student.aiProfileSummary
            ? aiText(
                'Сегодня занятие по робототехнике — не забудь про датчики. До пятницы стоит сдать задачи по Python.',
              )
            : null,
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
        return json(StudentProfileDtoSchema, {
          user: userBrief(auth.user.id),
          classLabel: student.classLabel,
          school: student.schoolId ? { id: demoSchool.id, name: demoSchool.name } : null,
          clubs: groupIdsOfStudent(student.id).map((g) => clubProgress(student.id, g)),
          stats: statsBrief(student.id),
          interests: student.interests,
          goals: student.goals,
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/home'),
    authed(
      ({ auth, params }) => {
        const parent = parentOfUser(auth.user.id);
        if (!parent || !childrenIdsOfParent(parent.id).includes(params.studentId)) {
          return apiError('FORBIDDEN', 'Ребёнок не привязан');
        }
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
        const parent = parentOfUser(auth.user.id);
        if (!parent || !childrenIdsOfParent(parent.id).includes(params.studentId)) {
          return apiError('FORBIDDEN', 'Ребёнок не привязан');
        }
        const studentId = params.studentId;
        const q = query(request);
        const lessons = inPeriod(
          lessonsOfGroups(groupIdsOfStudent(studentId)),
          q.get('from'),
          q.get('to'),
        );
        const graded = db.submissions.filter(
          (s) => s.studentId === studentId && s.status === 'GRADED',
        );
        return json(ChildAnalyticsDtoSchema, {
          stats: statsBrief(studentId),
          clubs: groupIdsOfStudent(studentId).map((g) => clubProgress(studentId, g)),
          weekly: weeklyPoints(),
          recentResults: graded.map((s) => ({
            assignment: assignmentBrief(s.assignmentId, studentId),
            score: s.score ?? 0,
            maxScore: assignmentBrief(s.assignmentId).maxScore,
            submittedAt: s.submittedAt ?? s.gradedAt ?? new Date().toISOString(),
            isLate: s.isLate,
          })),
          attendanceHistory: lessons
            .map((l) => ({
              lesson: lessonDto(l, studentId),
              status: lessonDto(l, studentId).attendance ?? null,
            }))
            .filter(
              (
                x,
              ): x is {
                lesson: ReturnType<typeof lessonDto>;
                status: NonNullable<typeof x.status>;
              } => x.status !== null,
            ),
          aiSummary: aiText(
            'Посещаемость стабильная, выполнение заданий растёт. Стоит обратить внимание на дедлайны по Python.',
          ),
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
          events: db.notifications
            .filter((n) => n.userId === auth.user.id)
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
        if (!group) return apiError('NOT_FOUND', 'Группа не найдена');
        if (!teacher || group.teacherId !== teacher.id)
          return apiError('FORBIDDEN', 'Чужая группа');
        return json(GroupDetailSchema, {
          ...groupCard(group.id),
          schedule: scheduleOfGroup(group.id),
          students: studentIdsOfGroup(group.id).map((studentId) => {
            const stats = statsBrief(studentId);
            const course = db.courses.find((c) => c.groupId === group.id);
            return {
              student: studentBrief(studentId),
              attendanceRate: stats.attendanceRate,
              completionRate: stats.completionRate,
              progress: course ? clubProgress(studentId, group.id).percent : 0,
              activityScore: stats.activityScore,
              needsAttention: needsAttention(studentId),
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
        if (!db.students.some((s) => s.id === studentId))
          return apiError('NOT_FOUND', 'Ученик не найден');
        const teacherGroupIds = groupsOfTeacher(teacher.id).map((g) => g.id);
        const groupIds = groupIdsOfStudent(studentId).filter((g) => teacherGroupIds.includes(g));
        if (groupIds.length === 0) return apiError('FORBIDDEN', 'Ученик не в ваших группах');
        const lessons = lessonsOfGroups(groupIds);
        return json(TeacherStudentCardSchema, {
          student: studentBrief(studentId),
          groups: groupIds.map((g) => groupCard(g)),
          stats: statsBrief(studentId),
          clubs: groupIds.map((g) => clubProgress(studentId, g)),
          weekly: weeklyPoints(),
          history: db.submissions
            .filter((s) => s.studentId === studentId && s.submittedAt)
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
        });
      },
      ['TEACHER'],
    ),
  ),
];
