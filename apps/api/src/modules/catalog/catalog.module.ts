import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchoolModule } from '../school/school.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** catalog: каталог кружков, карточка кружка и публичный профиль преподавателя. */
@Module({
  imports: [IdentityModule, SchoolModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
