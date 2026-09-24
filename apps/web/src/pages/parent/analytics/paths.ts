/** Пути экранов «Успеваемость» родителя. */
export const analyticsPaths = {
  picker: '/parent/analytics',
  /** `club` — какой кружок раскрыть (возврат с подробностей заданий). */
  child: (studentId: string, club?: string) =>
    `/parent/analytics/${studentId}${club ? `?club=${encodeURIComponent(club)}` : ''}`,
  tasks: (studentId: string, groupId: string, task?: string) =>
    `/parent/analytics/${studentId}/groups/${groupId}/tasks${task ? `?task=${encodeURIComponent(task)}` : ''}`,
};
