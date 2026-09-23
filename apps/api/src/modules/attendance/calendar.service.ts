import { Injectable } from '@nestjs/common';
import type { LessonsList, PeriodQuery } from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { periodBounds } from '../../common/time/period';
import { FamilyService } from '../family/family.service';
import { GroupsService } from '../groups/groups.service';
import { AttendanceService } from './attendance.service';

/** Календарь ученика и его родителя: занятия групп за период с отметками посещаемости. */
@Injectable()
export class CalendarService {
  constructor(
    private readonly groups: GroupsService,
    private readonly attendance: AttendanceService,
    private readonly family: FamilyService,
  ) {}

  async forStudent(user: AuthUser, query: PeriodQuery): Promise<LessonsList> {
    if (user.activeRole !== 'STUDENT' || !user.profileId)
      throw Errors.forbidden('Только для ученика');
    return this.build(user.profileId, query);
  }

  async forChild(user: AuthUser, studentId: string, query: PeriodQuery): Promise<LessonsList> {
    if (user.activeRole !== 'PARENT' || !user.profileId)
      throw Errors.forbidden('Только для родителя');
    await this.family.assertParentLinked(user.profileId, studentId);
    return this.build(studentId, query);
  }

  private async build(studentId: string, query: PeriodQuery): Promise<LessonsList> {
    const { from, to } = periodBounds(query);
    const groupIds = await this.groups.listGroupIdsOfStudent(studentId);
    const lessons = await this.groups.listLessons(groupIds, from, to);
    const statuses = await this.attendance.statusesOfStudent(
      studentId,
      lessons.map((lesson) => lesson.id),
    );
    return {
      lessons: lessons.map((lesson) => ({
        ...lesson,
        attendance: statuses.get(lesson.id) ?? null,
      })),
    };
  }
}
