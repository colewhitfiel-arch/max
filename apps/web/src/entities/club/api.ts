import type { ChildClubsList, ListClubsQuery } from '@edu/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { clubKeys } from './keys';
import type { ClubOffer } from './model';

/** Сколько кружков каталога показывать на витрине родителя. */
const OFFERS_LIMIT = 50;

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

/**
 * Витрина «Кружки для ваших детей» (профиль родителя): `GET /catalog/clubs` + кружки выбранного
 * ребёнка (`GET /parent/children/:studentId/clubs`), чтобы отметить, куда он уже ходит. Новые
 * кружки — первыми. Запись пока заглушка: ручки записи в контракте нет. `enabled: false` —
 * подождать (например, пока не загрузился список детей), чтобы не качать витрину дважды.
 */
export function useClubOffers(studentId: string | null, enabled = true) {
  return useQuery({
    queryKey: clubKeys.offers(studentId),
    queryFn: async (): Promise<{ items: ClubOffer[] }> => {
      const [catalog, enrolled] = await Promise.all([
        call(api.catalog.listClubs({ query: { limit: OFFERS_LIMIT } })),
        studentId
          ? call(api.family.listChildClubs({ params: { studentId } }))
          : Promise.resolve<ChildClubsList>({ items: [] }),
      ]);
      const taken = new Set(enrolled.items.map((item) => item.club.id));
      const items = catalog.items.map((club) => ({ club, enrolled: taken.has(club.id) }));
      return { items: [...items.filter((o) => !o.enrolled), ...items.filter((o) => o.enrolled)] };
    },
    enabled,
  });
}

/** `GET /teachers/:teacherId` — публичная карточка преподавателя. */
export function useTeacherCard(teacherId: string) {
  return useQuery({
    queryKey: clubKeys.teacher(teacherId),
    queryFn: () => call(api.catalog.getTeacherPublicProfile({ params: { teacherId } })),
  });
}
