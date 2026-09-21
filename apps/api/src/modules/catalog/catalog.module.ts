import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';

/** catalog: публичный сервис карточек кружков. Ручки каталога — workstream D. */
@Module({
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
