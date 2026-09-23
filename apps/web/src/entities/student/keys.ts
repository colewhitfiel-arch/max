import type { HomeworkProgressDays, PeriodQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const studentKeys = {
  children: () => [...queryKeys.parentRoot, 'children'] as const,
  parentHome: (studentId: string) => [...queryKeys.parent(studentId), 'home'] as const,
  childAnalytics: (studentId: string, period: PeriodQuery) =>
    [...queryKeys.parent(studentId), 'analytics', period] as const,
  homeworkProgress: (studentId: string, days: HomeworkProgressDays) =>
    [...queryKeys.parent(studentId), 'homework-progress', days] as const,
  /** Приглашение родителя глазами ученика (ссылка `/invite/:token`). */
  parentInvite: (token: string) => [...queryKeys.student, 'parent-invites', token] as const,
  teacherStudent: (studentId: string) => [...queryKeys.teacher, 'students', studentId] as const,
  /** Задания группы по ученику глазами преподавателя (вложен в ключ карточки ученика). */
  teacherStudentGroupTasks: (studentId: string, groupId: string) =>
    [...queryKeys.teacher, 'students', studentId, 'groups', groupId, 'tasks'] as const,
};
