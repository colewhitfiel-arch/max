/**
 * Пути экранов преподавателя, на которые ссылаются страницы разных фич (главная, настройки,
 * профиль, группы → кошелёк, успеваемость, ученик). Живут в shared, чтобы страницы одной роли
 * не импортировали модули друг друга (AGENT_GUIDE §3); схема URL — docs/FOUNDATION.
 */

/** Главная преподавателя — куда закрываются экраны, открытые не из приложения. */
export const TEACHER_HOME_PATH = '/teacher';

/** Кошелёк преподавателя (макет 59:16). */
export const TEACHER_WALLET_PATH = '/teacher/wallet';

/** «Общая успеваемость» и ученики группы. */
export const teacherPerformancePaths = {
  overview: '/teacher/performance',
  /** Ученики группы — выбор ученика для подробной успеваемости. */
  group: (groupId: string) => `/teacher/performance/groups/${groupId}`,
};

/** Успеваемость и задания ученика. */
export const teacherStudentPaths = {
  /** `club` — какой курс (группу) раскрыть (возврат с заданий). */
  student: (studentId: string, club?: string) =>
    `/teacher/students/${studentId}${club ? `?club=${encodeURIComponent(club)}` : ''}`,
  tasks: (studentId: string, groupId: string, task?: string) =>
    `/teacher/students/${studentId}/groups/${groupId}/tasks${task ? `?task=${encodeURIComponent(task)}` : ''}`,
};

/** «Что вы ведёте?» — выбор своих кружков (профиль, главная, сразу после выбора роли). */
export const TEACHER_SUBJECTS_PATH = '/teacher/profile/subjects';

/** Состояние перехода на выбор кружков сразу после роли: после сохранения — на главную. */
export const TEACHER_SUBJECTS_SETUP_STATE = { teacherSetup: true } as const;

export function isTeacherSetup(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'teacherSetup' in state;
}

/** Группы преподавателя: список, создание, карточка и правка состава (в том числе из «Задать ДЗ»). */
export const teacherGroupPaths = {
  list: '/teacher/groups',
  create: '/teacher/groups/new',
  group: (groupId: string) => `/teacher/groups/${groupId}`,
  /** Название и состав группы. */
  edit: (groupId: string) => `/teacher/groups/${groupId}/edit`,
};
