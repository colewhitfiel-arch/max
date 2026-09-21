/**
 * Реестр доменных модулей. Единственное место, куда добавляется новый модуль
 * (одна строка). Владелец файла — api-shell; агент модуля просит добавить строку.
 */
import type { Type } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { CatalogModule } from './catalog/catalog.module';
import { CourseBuilderModule } from './course-builder/course-builder.module';
import { CoursesModule } from './courses/courses.module';
import { FilesModule } from './files/files.module';
import { StorageModule } from './files/storage/storage.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';

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
];
