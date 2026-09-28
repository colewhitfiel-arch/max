import { Injectable } from '@nestjs/common';
import type { GroupCard, GroupDetail, GroupStudentRow, StudentBrief } from '@edu/contracts';
import { Errors } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AttendanceService } from '../attendance/attendance.service';
import { GroupsService } from '../groups/groups.service';
import { activityScore, attendanceRate, completionRate } from './metrics';

/** Окно, за которое считаются посещаемость и выполнение на карточках групп. */
const WINDOW_DAYS = 90;
/** Окно «активности» ученика (docs/04 §4.6 — неделя). */
const ACTIVITY_WINDOW_DAYS = 7;
/** Ниже этой посещаемости ученик попадает в «требует внимания». */
const LOW_ATTENDANCE = 0.7;
/** Ниже этой доли выполненных заданий — тоже. */
const LOW_COMPLETION = 0.5;

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Группы преподавателя с показателями (`GET /teacher/groups`, `GET /teacher/groups/:id`).
 * Формулы — только из `metrics.ts` (AGENT_GUIDE §5), счётчики приносят сервисы своих модулей.
 */
@Injectable()
export class TeacherGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    private readonly attendance: AttendanceService,
    private readonly assignments: AssignmentsService,
  ) {}

  async listGroups(teacherId: string): Promise<{ items: GroupCard[] }> {
    const briefs = await this.groups.listGroupBriefsByTeacher(teacherId);
    const items = await Promise.all(briefs.map((brief) => this.card(brief)));
    return { items };
  }

  async getGroup(teacherId: string, groupId: string): Promise<GroupDetail> {
    await this.groups.assertTeacherOwnsGroup(teacherId, groupId);
    const briefs = await this.groups.groupBriefsByIds([groupId]);
    const brief = briefs.get(groupId);
    if (!brief) throw Errors.notFound('Группа');
    const roster = await this.groups.listRoster(groupId);
    const [card, students, schedule] = await Promise.all([
      this.card(brief, roster),
      this.studentRows(groupId, roster),
      this.schedule(groupId),
    ]);
    return {
      ...card,
      schedule,
      students,
      needsAttentionCount: students.filter((row) => row.needsAttention.length > 0).length,
    };
  }

  // ---------- внутреннее ----------

  private async card(
    brief: Awaited<ReturnType<GroupsService['listGroupBriefsByTeacher']>>[number],
    knownRoster?: StudentBrief[],
  ): Promise<GroupCard> {
    const roster = knownRoster ?? (await this.groups.listRoster(brief.id));
    const studentIds = roster.map((student) => student.id);
    const period = { from: daysAgo(WINDOW_DAYS), to: new Date() };
    const [attendance, completion, nextLesson] = await Promise.all([
      this.attendance.attendanceOfGroup(brief.id, studentIds, period),
      this.assignments.completionOfGroup(brief.id, studentIds),
      this.nextLesson(brief.id),
    ]);
    // Знаменатель — сумма зачётных занятий учеников: у каждого свои, с даты зачисления.
    const attended = studentIds.reduce((sum, id) => sum + (attendance.get(id)?.attended ?? 0), 0);
    const countable = studentIds.reduce((sum, id) => sum + (attendance.get(id)?.countable ?? 0), 0);
    const due = studentIds.reduce((sum, id) => sum + (completion.get(id)?.due ?? 0), 0);
    const doneOnTime = studentIds.reduce(
      (sum, id) => sum + (completion.get(id)?.doneOnTime ?? 0),
      0,
    );
    return {
      ...brief,
      studentsCount: roster.length,
      attendanceRate: attendanceRate(attended, countable),
      completionRate: completionRate(doneOnTime, due),
      // Точный счёт «требует внимания» есть в детали группы; в списке он считается так же,
      // но по агрегатам — поэтому здесь 0, пока не открыта карточка (docs/12, зона A).
      needsAttentionCount: 0,
      nextLesson,
    };
  }

  private async studentRows(groupId: string, roster: StudentBrief[]): Promise<GroupStudentRow[]> {
    const studentIds = roster.map((student) => student.id);
    if (studentIds.length === 0) return [];
    const period = { from: daysAgo(WINDOW_DAYS), to: new Date() };
    const [attendance, completion, submissions, progress, blocks] = await Promise.all([
      this.attendance.attendanceOfGroup(groupId, studentIds, period),
      this.assignments.completionOfGroup(groupId, studentIds),
      this.assignments.submissionCountsOfGroup(groupId, studentIds, daysAgo(ACTIVITY_WINDOW_DAYS)),
      this.courseProgress(groupId, studentIds),
      this.blocksCompleted(studentIds, daysAgo(ACTIVITY_WINDOW_DAYS)),
    ]);
    return roster.map((student) => {
      const { attended, countable } = attendance.get(student.id) ?? { attended: 0, countable: 0 };
      const done = completion.get(student.id) ?? { doneOnTime: 0, due: 0 };
      const rate = attendanceRate(attended, countable);
      const completed = completionRate(done.doneOnTime, done.due);
      const needsAttention: string[] = [];
      if (rate !== null && rate < LOW_ATTENDANCE) needsAttention.push('Пропускает занятия');
      if (completed !== null && completed < LOW_COMPLETION)
        needsAttention.push('Не сдаёт задания вовремя');
      return {
        student,
        attendanceRate: rate,
        completionRate: completed,
        progress: progress.get(student.id) ?? 0,
        activityScore: activityScore({
          blocksCompleted: blocks.get(student.id) ?? 0,
          submissions: submissions.get(student.id) ?? 0,
          lessonsAttended: attended,
          tutorMessages: 0,
        }),
        needsAttention,
      };
    });
  }

  /** Ближайшее будущее занятие группы (не отменённое). */
  private async nextLesson(groupId: string): Promise<GroupCard['nextLesson']> {
    const lessons = await this.groups.listLessons(
      [groupId],
      new Date(),
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );
    return lessons.find((lesson) => lesson.status !== 'CANCELLED') ?? null;
  }

  private async schedule(groupId: string): Promise<GroupDetail['schedule']> {
    const rules = await this.prisma.scheduleRule.findMany({
      where: { groupId },
      select: { id: true, weekday: true, startTime: true, endTime: true, room: true },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return rules;
  }

  private async courseProgress(
    groupId: string,
    studentIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.courseProgress.findMany({
      where: { studentId: { in: studentIds }, course: { groupId, status: 'PUBLISHED' } },
      select: { studentId: true, percent: true },
    });
    const byStudent = new Map<string, number[]>();
    for (const row of rows) {
      byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row.percent]);
    }
    return new Map(
      [...byStudent].map(([studentId, percents]) => [
        studentId,
        Math.round(percents.reduce((a, b) => a + b, 0) / percents.length),
      ]),
    );
  }

  private async blocksCompleted(studentIds: string[], since: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.blockProgress.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, status: 'COMPLETED', completedAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.studentId, row._count._all]));
  }
}
