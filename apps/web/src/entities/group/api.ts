import type { CreateGroupBody, TeacherPerformancePeriod } from '@edu/contracts';
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

/** `GET /teacher/groups/:groupId`. */
export function useTeacherGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => call(api.dashboards.getTeacherGroup({ params: { groupId } })),
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
 * `POST /teacher/groups` — своя группа (и кружок в каталоге) сразу со ссылкой-приглашением.
 * Списки групп, главная и календарь преподавателя после этого перезапрашиваются.
 */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGroupBody) => call(api.groups.createGroup({ body })),
    onSuccess: (created) => {
      queryClient.setQueryData(groupKeys.invite(created.group.id), created.invite);
      return queryClient.invalidateQueries({ queryKey: queryKeys.teacher });
    },
  });
}

/** `GET /teacher/groups/:groupId/invite` — ссылка группы (создаётся при первом запросе). */
export function useGroupInvite(groupId: string, enabled = true) {
  return useQuery({
    queryKey: groupKeys.invite(groupId),
    queryFn: () => call(api.groups.getGroupInvite({ params: { groupId } })),
    enabled,
    staleTime: Infinity,
  });
}

/** `POST /teacher/groups/:groupId/invite/reset` — новая ссылка, старая перестаёт работать. */
export function useResetGroupInvite(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.groups.resetGroupInvite({ params: { groupId } })),
    onSuccess: (invite) => queryClient.setQueryData(groupKeys.invite(groupId), invite),
  });
}

/** `GET /student/group-invites/:token` — группа по ссылке глазами ученика. */
export function useGroupInvitePreview(token: string) {
  return useQuery({
    queryKey: groupKeys.joinPreview(token),
    queryFn: () => call(api.groups.getGroupInvitePreview({ params: { token } })),
    enabled: !!token,
    retry: false,
  });
}

/** `POST /student/group-invites/:token/join` — вступить; данные ученика перезапрашиваются. */
export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => call(api.groups.joinGroup({ params: { token } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.student }),
  });
}
