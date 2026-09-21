import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { SchoolModule } from '../school/school.module';
import { AuthController } from './auth.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

/** identity: вход, роли, профили, сессии. Публичный сервис — IdentityService. */
@Module({
  imports: [SchoolModule, FamilyModule],
  controllers: [AuthController],
  providers: [IdentityRepository, IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
