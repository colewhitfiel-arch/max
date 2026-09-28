import { Controller } from '@nestjs/common';
import { familyContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit';
import { ChildrenService } from './children.service';

/** Реализация contracts/routes/family.ts. */
@Controller()
export class ChildrenController {
  constructor(private readonly service: ChildrenService) {}

  @TsRestHandler(familyContract.listChildren)
  @RequirePermission('parent:children.manage')
  list(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.listChildren, async () => ({
      status: 200,
      body: await this.service.listChildren(user),
    }));
  }

  @TsRestHandler(familyContract.linkChild)
  @RequirePermission('parent:children.manage')
  @RateLimit('link')
  link(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.linkChild, async ({ body }) => ({
      status: 200,
      body: await this.service.linkChild(user, body),
    }));
  }

  @TsRestHandler(familyContract.createChildInvite)
  @RequirePermission('parent:children.manage')
  invite(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.createChildInvite, async () => ({
      status: 200,
      body: await this.service.createInvite(user),
    }));
  }

  @TsRestHandler(familyContract.unlinkChild)
  @RequirePermission('parent:children.manage')
  unlink(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.unlinkChild, async ({ params }) => {
      await this.service.unlinkChild(user, params.studentId);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(familyContract.listChildClubs)
  @RequirePermission('parent:child.clubs.view')
  clubs(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.listChildClubs, async ({ params }) => ({
      status: 200,
      body: await this.service.listChildClubs(user, params.studentId),
    }));
  }

  @TsRestHandler(familyContract.getParentInvite)
  @RequirePermission('student:parents.link')
  getInvite(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.getParentInvite, async ({ params }) => ({
      status: 200,
      body: await this.service.getInvite(user, params.token),
    }));
  }

  @TsRestHandler(familyContract.acceptParentInvite)
  @RequirePermission('student:parents.link')
  @RateLimit('link')
  acceptInvite(@CurrentUser() user: AuthUser) {
    return tsRestHandler(familyContract.acceptParentInvite, async ({ params }) => ({
      status: 200,
      body: await this.service.acceptInvite(user, params.token),
    }));
  }
}
