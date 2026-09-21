import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
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
