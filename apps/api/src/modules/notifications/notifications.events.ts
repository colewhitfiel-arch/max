import { Injectable } from '@nestjs/common';
import type { DomainEventPayload } from '@edu/contracts';
import { OnDomainEvent } from '../../common/events/domain-events';
import { AssignmentsService } from '../assignments/assignments.service';
import { FamilyService } from '../family/family.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { NotificationsService } from './notifications.service';

/**
 * Доменные события → уведомления (docs/12, workstream L). Обработчики идемпотентными не
 * притворяются: событие приходит один раз на факт, повторной отправки не бывает.
 * Кого уведомлять, решает здесь; можно ли — решают настройки в `NotificationsService.notify`.
 */
@Injectable()
export class NotificationsEvents {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly identity: IdentityService,
    private readonly family: FamilyService,
    private readonly groups: GroupsService,
    private readonly assignments: AssignmentsService,
  ) {}

  /** Проверили работу — ученику и его родителям. */
  @OnDomainEvent('submission.graded')
  async onGraded(payload: DomainEventPayload<'submission.graded'>): Promise<void> {
    const assignment = await this.assignments.briefInfo(payload.assignmentId);
    const recipients = await this.studentAndParents(payload.studentId);
    await this.notifications.notify(recipients, {
      type: 'ASSIGNMENT_GRADED',
      title: 'Задание проверено',
      body: `«${assignment?.title ?? 'Задание'}» — ${payload.score} из ${payload.maxScore}`,
      payload: {
        entityType: 'assignment',
        entityId: payload.assignmentId,
        route: `/student/assignments/${payload.assignmentId}`,
      },
    });
  }

  /** Ученик сдал работу — преподавателю задания. */
  @OnDomainEvent('submission.submitted')
  async onSubmitted(payload: DomainEventPayload<'submission.submitted'>): Promise<void> {
    const assignment = await this.assignments.briefInfo(payload.assignmentId);
    if (!assignment) return;
    const teacherUserId = await this.identity.userIdOfProfile('TEACHER', assignment.teacherId);
    if (!teacherUserId) return;
    await this.notifications.notify([teacherUserId], {
      type: 'SUBMISSION_RECEIVED',
      title: 'Новая сдача',
      body: `«${assignment.title}»${payload.isLate ? ' — сдано после срока' : ''}`,
      payload: {
        entityType: 'assignment',
        entityId: payload.assignmentId,
        route: `/teacher/assignments/${payload.assignmentId}/submissions`,
      },
    });
  }

  /** Пропуск занятия — ученику и родителям; присутствовавших не беспокоим. */
  @OnDomainEvent('attendance.marked')
  async onAttendance(payload: DomainEventPayload<'attendance.marked'>): Promise<void> {
    const absent = payload.rows.filter((row) => row.status === 'ABSENT');
    for (const row of absent) {
      const recipients = await this.studentAndParents(row.studentId);
      await this.notifications.notify(recipients, {
        type: 'ATTENDANCE_ABSENT',
        title: 'Пропуск занятия',
        body: 'Отмечено отсутствие на занятии',
        payload: { entityType: 'lesson', entityId: payload.lessonId, route: '/student/calendar' },
      });
    }
  }

  /** Опубликован курс — ученикам группы (и родителям), по одному уведомлению на публикацию. */
  @OnDomainEvent('course.published')
  async onCoursePublished(payload: DomainEventPayload<'course.published'>): Promise<void> {
    const roster = await this.groups.listRoster(payload.groupId);
    const hasNewTasks = payload.blockAssignments.length > 0;
    for (const student of roster) {
      const recipients = await this.studentAndParents(student.id);
      await this.notifications.notify(recipients, {
        type: hasNewTasks ? 'ASSIGNMENT_NEW' : 'COURSE_PUBLISHED',
        title: hasNewTasks ? 'Новые задания' : 'Новый материал',
        body: hasNewTasks
          ? `Добавлено заданий: ${payload.blockAssignments.length}`
          : 'Преподаватель опубликовал курс',
        payload: {
          entityType: 'course',
          entityId: payload.courseId,
          route: `/student/courses/${payload.courseId}`,
        },
      });
    }
  }

  /** Занятие отменили — ученикам группы и родителям. */
  @OnDomainEvent('lesson.cancelled')
  async onLessonCancelled(payload: DomainEventPayload<'lesson.cancelled'>): Promise<void> {
    const roster = await this.groups.listRoster(payload.groupId);
    for (const student of roster) {
      const recipients = await this.studentAndParents(student.id);
      await this.notifications.notify(recipients, {
        type: 'LESSON_CANCELLED',
        title: 'Занятие отменено',
        body: null,
        payload: { entityType: 'lesson', entityId: payload.lessonId, route: '/student/calendar' },
      });
    }
  }

  /** Оплата прошла — родителю, который платил. */
  @OnDomainEvent('payment.succeeded')
  async onPayment(payload: DomainEventPayload<'payment.succeeded'>): Promise<void> {
    const parentUserId = await this.identity.userIdOfProfile('PARENT', payload.parentId);
    if (!parentUserId) return;
    await this.notifications.notify([parentUserId], {
      type: 'PAYMENT_SUCCEEDED',
      title: 'Оплата прошла',
      body: `Оплачено периодов: ${payload.periodsCount}`,
      payload: {
        entityType: 'payment',
        entityId: payload.paymentId,
        route: `/parent/payments/${payload.paymentId}`,
      },
    });
  }

  /** Генерация курса закончилась — преподавателю, который её запустил. */
  @OnDomainEvent('generation.finished')
  async onGeneration(payload: DomainEventPayload<'generation.finished'>): Promise<void> {
    const teacherUserId = await this.identity.userIdOfProfile('TEACHER', payload.teacherId);
    if (!teacherUserId) return;
    await this.notifications.notify([teacherUserId], {
      type: 'GENERATION_DONE',
      title: payload.stage === 'READY' ? 'Курс сгенерирован' : 'Генерация не удалась',
      body:
        payload.stage === 'READY'
          ? 'Черновик готов к проверке'
          : 'Попробуй запустить генерацию ещё раз',
      payload: {
        entityType: 'generationJob',
        entityId: payload.jobId,
        route: `/teacher/course-builder/${payload.jobId}`,
      },
    });
  }

  /** Ученик и все его активные родители — типовой список адресатов. */
  private async studentAndParents(studentId: string): Promise<string[]> {
    const [studentUserId, parentUserIds] = await Promise.all([
      this.identity.userIdOfProfile('STUDENT', studentId),
      this.family.listParentUserIdsOf(studentId),
    ]);
    return [...(studentUserId ? [studentUserId] : []), ...parentUserIds];
  }
}
