import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/**
 * `tutor` — новый чат, `tutor/:conversationId` — открытый диалог. Один маршрут с необязательным
 * сегментом: переход нового чата на созданный им диалог не пересоздаёт экран (стрим не рвётся).
 */
export const studentTutorRoutes: RouteObject[] = [
  { path: 'tutor/:conversationId?', lazy: lazyRoute(() => import('./ui/TutorPage'), 'TutorPage') },
];
