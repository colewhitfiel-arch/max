import type { ListClubsQuery } from '@edu/contracts';
import { queryKeys } from '@/shared/api/query-keys';

export const clubKeys = {
  catalog: (query: ListClubsQuery) => [...queryKeys.catalog, 'clubs', query] as const,
  catalogClub: (clubId: string) => [...queryKeys.catalog, 'clubs', clubId] as const,
  teacher: (teacherId: string) => [...queryKeys.catalog, 'teachers', teacherId] as const,
  childClubs: (studentId: string) => [...queryKeys.parent(studentId), 'clubs'] as const,
  /** Витрина кружков родителя; с ребёнком — под его префиксом (отвязка чистит кэш). */
  offers: (studentId: string | null) =>
    studentId
      ? ([...queryKeys.parent(studentId), 'club-offers'] as const)
      : ([...queryKeys.catalog, 'club-offers'] as const),
};
