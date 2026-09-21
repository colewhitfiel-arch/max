/**
 * Префиксы ключей TanStack Query (владелец — web-shell). Ключи сущностей — в `entities/<x>/keys.ts`
 * и начинаются с этих префиксов, чтобы инвалидация по роли/ребёнку работала одним вызовом.
 */
export const queryKeys = {
  me: ['me'] as const,
  health: ['health'] as const,
  student: ['student'] as const,
  /** Все данные родителя привязаны к выбранному ребёнку. */
  parent: (studentId: string) => ['parent', studentId] as const,
  parentRoot: ['parent'] as const,
  teacher: ['teacher'] as const,
  ai: ['ai'] as const,
  notifications: ['notifications'] as const,
  catalog: ['catalog'] as const,
} as const;

export type QueryKeyPrefix = keyof typeof queryKeys;
