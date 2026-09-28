import type { CreateGroupBody, TeacherPerformancePeriod, UpdateGroupBody } from '@edu/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { groupKeys } from './keys';

/** `GET /teacher/groups`. */
export function useTeacherGroups() {
  return useQuery({
    queryKey: groupKeys.list(),
    queryFn: () => call(api.dashboards.listTeacherGroups()),
  });
}

/** `GET /teacher/groups/:groupId`. Пока группа не выбрана (`''`), запроса нет. */
export function useTeacherGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => call(api.dashboards.getTeacherGroup({ params: { groupId } })),
    enabled: !!groupId,
  });
}

/**
 * `GET /teacher/performance?period=day|week|month|course` — «Общая успеваемость»: посещения и
 * задания по каждой группе преподавателя за период (счётчики считает analytics, docs/04 §4.6).
 * Смена периода не мигает скелетом: до ответа видны данные прежнего периода
 * (`isPlaceholderData`).
 */
export function useTeacherPerformance(period: TeacherPerformancePeriod) {
  return useQuery({
    queryKey: groupKeys.performance(period),
    queryFn: () => call(api.dashboards.getTeacherPerformance({ query: { period } })),
    placeholderData: keepPreviousData,
  });
}

/**
 * Группы меняют главную, списки, успеваемость и мастер «Задать ДЗ» преподавателя — после
 * любой правки группы перезапрашиваем всё под префиксом `teacher`.
 */
function useInvalidateTeacher() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.teacher });
}

/** `POST /teacher/groups` — новая группа (название + кружок школы). */
export function useCreateGroup() {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: (body: CreateGroupBody) => call(api.groups.createGroup({ body })),
    onSuccess: invalidate,
  });
}

/** `PATCH /teacher/groups/:groupId` — переименовать группу. */
export function useUpdateGroup(groupId: string) {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: (body: UpdateGroupBody) =>
      call(api.groups.updateGroup({ params: { groupId }, body })),
    onSuccess: invalidate,
  });
}

/** `GET /teacher/groups/:groupId/candidates?q` — кого можно добавить в группу. */
export function useGroupCandidates(groupId: string, q: string) {
  const search = q.trim();
  return useQuery({
    queryKey: groupKeys.candidates(groupId, search),
    queryFn: () =>
      call(
        api.groups.listGroupCandidates({
          params: { groupId },
          query: search ? { q: search } : {},
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** `POST /teacher/groups/:groupId/students` — добавить ученика в группу. */
export function useAddGroupStudent(groupId: string) {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: (studentId: string) =>
      call(api.groups.addGroupStudent({ params: { groupId }, body: { studentId } })),
    onSuccess: invalidate,
  });
}

/** `DELETE /teacher/groups/:groupId/students/:studentId` — убрать ученика из группы. */
export function useRemoveGroupStudent(groupId: string) {
  const invalidate = useInvalidateTeacher();
  return useMutation({
    mutationFn: (studentId: string) =>
      call(api.groups.removeGroupStudent({ params: { groupId, studentId } })),
    onSuccess: invalidate,
  });
}
