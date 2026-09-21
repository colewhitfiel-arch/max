/**
 * Публичный entry `@edu/contracts`: enum'ы, ошибки, примитивы, сущности, блоки, события,
 * permissions, контракты по доменам и собранный роутер `apiContract`.
 * Фикстуры — отдельный entry `@edu/contracts/fixtures`.
 */
import {
  aiContract,
  assignmentsContract,
  attendanceContract,
  authContract,
  catalogContract,
  courseBuilderContract,
  coursesContract,
  dashboardsContract,
  familyContract,
  filesContract,
  groupsContract,
  healthContract,
  notificationsContract,
  paymentsContract,
  supportContract,
} from './routes';

export * from './enums';
export * from './errors';
export * from './common';
export * from './entities';
export * from './blocks';
export * from './events';
export * from './permissions';
export * from './routes';

/** Базовый префикс всех путей API; в контракте пути указаны без него. */
export const API_PREFIX = '/api/v1';

/**
 * Единый роутер API (ts-rest AppRouter). `commonResponses` и `strictStatusCodes` уже применены
 * в каждом доменном роутере (`contractRouterOptions`), поэтому здесь — простая композиция.
 * Тип задан явно через `typeof` доменов: иначе TypeScript не может сериализовать его в d.ts.
 */
export type ApiContract = {
  health: typeof healthContract;
  auth: typeof authContract;
  dashboards: typeof dashboardsContract;
  catalog: typeof catalogContract;
  groups: typeof groupsContract;
  attendance: typeof attendanceContract;
  courses: typeof coursesContract;
  assignments: typeof assignmentsContract;
  ai: typeof aiContract;
  family: typeof familyContract;
  payments: typeof paymentsContract;
  files: typeof filesContract;
  courseBuilder: typeof courseBuilderContract;
  notifications: typeof notificationsContract;
  support: typeof supportContract;
};

export const apiContract: ApiContract = {
  health: healthContract,
  auth: authContract,
  dashboards: dashboardsContract,
  catalog: catalogContract,
  groups: groupsContract,
  attendance: attendanceContract,
  courses: coursesContract,
  assignments: assignmentsContract,
  ai: aiContract,
  family: familyContract,
  payments: paymentsContract,
  files: filesContract,
  courseBuilder: courseBuilderContract,
  notifications: notificationsContract,
  support: supportContract,
};
