import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role } from '../../auth/entities';
import { Plan } from '../../payments/entities/plan.entity';
import { AuthModule } from '../../auth/auth.module';
import { SecurityModule } from '../../security/security.module';
import { SeedingService } from './seeding.service';
import { RolesSeed } from './roles.seed';
import { AdminSeed } from './admin.seed';
import { PlansSeed } from './plans.seed';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Plan]),
    AuthModule,
    SecurityModule,
  ],
  providers: [SeedingService, RolesSeed, AdminSeed, PlansSeed],
  exports: [SeedingService],
})
export class SeedsModule {}
