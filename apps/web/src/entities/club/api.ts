import type { ListClubsQuery } from '@edu/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { clubKeys } from './keys';

/** `GET /catalog/clubs?category`. */
export function useCatalogClubs(query: ListClubsQuery = {}) {
  return useQuery({
    queryKey: clubKeys.catalog(query),
    queryFn: () => call(api.catalog.listClubs({ query })),
  });
}

/** `GET /catalog/clubs/:clubId`. */
export function useCatalogClub(clubId: string) {
  return useQuery({
    queryKey: clubKeys.catalogClub(clubId),
    queryFn: () => call(api.catalog.getClub({ params: { clubId } })),
  });
}

/** `GET /parent/children/:studentId/clubs`. */
export function useChildClubs(studentId: string | null) {
  return useQuery({
    queryKey: clubKeys.childClubs(studentId ?? ''),
    queryFn: () => call(api.family.listChildClubs({ params: { studentId: studentId! } })),
    enabled: !!studentId,
  });
}

/** `GET /teachers/:teacherId` — публичная карточка преподавателя. */
export function useTeacherCard(teacherId: string) {
  return useQuery({
    queryKey: clubKeys.teacher(teacherId),
    queryFn: () => call(api.catalog.getTeacherPublicProfile({ params: { teacherId } })),
  });
}
