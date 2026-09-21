/**
 * Агрегатор MSW-хендлеров (владелец — web-shell). Агент домена пишет `handlers/<domain>.ts`,
 * здесь он подключается одной строкой. Последний хендлер — 501 для нереализованных ручек API.
 */
import { http } from 'msw';
import { apiError, apiUrl } from '../lib';
import { aiHandlers } from './ai';
import { assignmentsHandlers } from './assignments';
import { authHandlers } from './auth';
import { catalogHandlers } from './catalog';
import { courseBuilderHandlers } from './course-builder';
import { coursesHandlers } from './courses';
import { dashboardsHandlers } from './dashboards';
import { familyHandlers } from './family';
import { filesHandlers } from './files';
import { groupsHandlers } from './groups';
import { healthHandlers } from './health';
import { notificationsHandlers } from './notifications';
import { paymentsHandlers } from './payments';

export const handlers = [
  ...healthHandlers,
  ...authHandlers,
  ...dashboardsHandlers,
  ...catalogHandlers,
  ...groupsHandlers,
  ...coursesHandlers,
  ...courseBuilderHandlers,
  ...filesHandlers,
  ...assignmentsHandlers,
  ...familyHandlers,
  ...paymentsHandlers,
  ...notificationsHandlers,
  ...aiHandlers,
  // Всё остальное под префиксом API — «раздел в разработке».
  http.all(apiUrl('/*'), () => apiError('NOT_IMPLEMENTED', 'Ручка ещё не замокана')),
];
