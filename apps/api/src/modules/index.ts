/**
 * Реестр доменных модулей. Единственное место, куда добавляется новый модуль
 * (одна строка). Владелец файла — api-shell; агент модуля просит добавить строку.
 */
import type { Type } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { StorageModule } from './files/storage/storage.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';

export const DOMAIN_MODULES: Type<unknown>[] = [
  // инфраструктурные (глобальные): хранилище файлов, ИИ-провайдер
  StorageModule,
  AiModule,
  // доменные
  HealthModule,
  IdentityModule,
];
