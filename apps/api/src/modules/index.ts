/**
 * Реестр доменных модулей. Единственное место, куда добавляется новый модуль
 * (одна строка). Владелец файла — api-shell; агент модуля просит добавить строку.
 */
import type { Type } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { CatalogModule } from './catalog/catalog.module';
import { CourseBuilderModule } from './course-builder/course-builder.module';
import { CoursesModule } from './courses/courses.module';
import { FilesModule } from './files/files.module';
import { StorageModule } from './files/storage/storage.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ParentModule } from './parent/parent.module';
import { SupportModule } from './support/support.module';
import { PaymentsModule } from './payments/payments.module';

export const DOMAIN_MODULES: Type<unknown>[] = [
  // инфраструктурные (глобальные): хранилище файлов, ИИ-провайдер + онбординг/тьютор/траектория
  StorageModule,
  AiModule,
  // доменные
  HealthModule,
  IdentityModule,
  GroupsModule,
  CatalogModule,
  CoursesModule,
  FilesModule,
  CourseBuilderModule,
  AttendanceModule,
  AssignmentsModule,
  AnalyticsModule,
  NotificationsModule,
  PaymentsModule,
  ParentModule,
  SupportModule,
];
