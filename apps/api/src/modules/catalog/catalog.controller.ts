import { Controller } from '@nestjs/common';
import { catalogContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { CatalogService } from './catalog.service';

/** Каталог кружков и публичные профили преподавателей (contracts/routes/catalog.ts). */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @TsRestHandler(catalogContract.listClubs)
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(catalogContract.listClubs, async ({ query }) => ({
      status: 200,
      body: await this.catalog.listClubs(user, query),
    }));
  }

  @TsRestHandler(catalogContract.getClub)
  get(@CurrentUser() user: AuthUser) {
    return tsRestHandler(catalogContract.getClub, async ({ params }) => ({
      status: 200,
      body: await this.catalog.getClub(user, params.clubId),
    }));
  }

  @TsRestHandler(catalogContract.getTeacherPublicProfile)
  teacher(@CurrentUser() user: AuthUser) {
    return tsRestHandler(catalogContract.getTeacherPublicProfile, async ({ params }) => ({
      status: 200,
      body: await this.catalog.getTeacherPublicProfile(user, params.teacherId),
    }));
  }
}
