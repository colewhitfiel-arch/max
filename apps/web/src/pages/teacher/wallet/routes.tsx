import type { RouteObject } from 'react-router';
import { lazyRoute } from '@/shared/lib/lazy-route';

/** Кошелёк преподавателя (заглушка до PaymentProvider): с чипа на главной и из настроек. */
export const teacherWalletRoutes: RouteObject[] = [
  { path: 'wallet', lazy: lazyRoute(() => import('./ui/TeacherWalletPage'), 'TeacherWalletPage') },
];
