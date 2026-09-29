import { Controller } from '@nestjs/common';
import { authContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { CurrentUser, Public, RequirePermission, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { IdentityService } from './identity.service';

/** Реализация contracts/routes/auth.ts. Роутинг и валидация — ts-rest; логика — IdentityService. */
@Controller()
export class AuthController {
  constructor(private readonly identity: IdentityService) {}

  @Public()
  @TsRestHandler(authContract.loginMax)
  loginMax() {
    return tsRestHandler(authContract.loginMax, async ({ body }) => ({
      status: 200,
      body: await this.identity.loginWithMax(body.launchParams),
    }));
  }

  @Public()
  @TsRestHandler(authContract.loginDev)
  loginDev() {
    return tsRestHandler(authContract.loginDev, async ({ body }) => ({
      status: 200,
      body: await this.identity.loginDev(body.maxUserId, body.roles),
    }));
  }

  @Public()
  @TsRestHandler(authContract.refresh)
  refresh() {
    return tsRestHandler(authContract.refresh, async ({ body }) => ({
      status: 200,
      body: await this.identity.refresh(body.refreshToken),
    }));
  }

  @TsRestHandler(authContract.addRole)
  addRole(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.addRole, async ({ body }) => ({
      status: 200,
      body: await this.identity.addRole(user, body.role, body.inviteCode),
    }));
  }

  @TsRestHandler(authContract.switchRole)
  switchRole(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.switchRole, async ({ body }) => ({
      status: 200,
      body: await this.identity.switchRole(user, body.role),
    }));
  }

  @TsRestHandler(authContract.logout)
  logout() {
    return tsRestHandler(authContract.logout, async ({ body }) => {
      await this.identity.logout(body.refreshToken);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(authContract.getMe)
  getMe(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.getMe, async () => ({
      status: 200,
      body: await this.identity.getMe(user.userId, user.activeRole),
    }));
  }

  @RequirePermission('common:settings.edit')
  @TsRestHandler(authContract.updateSettings)
  updateSettings(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.updateSettings, async ({ body }) => ({
      status: 200,
      body: await this.identity.updateSettings(user, body),
    }));
  }

  @RequirePermission('common:profile.edit')
  @TsRestHandler(authContract.updateAvatar)
  updateAvatar(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.updateAvatar, async ({ body }) => ({
      status: 200,
      body: await this.identity.updateAvatar(user, body.fileId),
    }));
  }

  @RequirePermission('common:profile.edit')
  @Roles('TEACHER')
  @TsRestHandler(authContract.updateTeacherProfile)
  updateTeacherProfile(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.updateTeacherProfile, async ({ body }) => ({
      status: 200,
      body: await this.identity.updateTeacherProfile(user, body),
    }));
  }

  @Roles('STUDENT')
  @TsRestHandler(authContract.rotateLinkCode)
  rotateLinkCode(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.rotateLinkCode, async () => ({
      status: 200,
      body: { linkCode: await this.identity.rotateLinkCode(user) },
    }));
  }
}
