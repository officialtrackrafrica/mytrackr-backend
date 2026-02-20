import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role } from '../../auth/entities';
import { AuthModule } from '../../auth/auth.module';
import { SecurityModule } from '../../security/security.module';
import { SeedingService } from './seeding.service';
import { RolesSeed } from './roles.seed';
import { AdminSeed } from './admin.seed';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role]), AuthModule, SecurityModule],
  providers: [SeedingService, RolesSeed, AdminSeed],
  exports: [SeedingService],
})
export class SeedsModule {}
