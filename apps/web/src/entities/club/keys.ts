import type { ListClubsQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const clubKeys = {
  catalog: (query: ListClubsQuery) => [...queryKeys.catalog, 'clubs', query] as const,
  catalogClub: (clubId: string) => [...queryKeys.catalog, 'clubs', clubId] as const,
  teacher: (teacherId: string) => [...queryKeys.catalog, 'teachers', teacherId] as const,
  childClubs: (studentId: string) => [...queryKeys.parent(studentId), 'clubs'] as const,
};
