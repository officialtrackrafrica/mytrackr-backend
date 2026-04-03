import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role } from '../../auth/entities';
import { Plan } from '../../payments/entities/plan.entity';
import { AccountCategory } from '../../finance/entities/account-category.entity';
import { AccountSubCategory } from '../../finance/entities/account-subcategory.entity';
import { AuthModule } from '../../auth/auth.module';
import { SecurityModule } from '../../security/security.module';
import { SeedingService } from './seeding.service';
import { RolesSeed } from './roles.seed';
import { AdminSeed } from './admin.seed';
import { PlansSeed } from './plans.seed';
import { FinancialCategoriesSeed } from './financial-categories.seed';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Plan,
      AccountCategory,
      AccountSubCategory,
    ]),
    AuthModule,
    SecurityModule,
  ],
  providers: [
    SeedingService,
    RolesSeed,
    AdminSeed,
    PlansSeed,
    FinancialCategoriesSeed,
  ],
  exports: [SeedingService],
})
export class SeedsModule {}
