import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Role } from '../../auth/entities';
import { Plan } from '../../payments/entities/plan.entity';
import { SystemSetting } from '../../admin/entities/system-setting.entity';
import { AccountCategory } from '../../finance/entities/account-category.entity';
import { AccountSubCategory } from '../../finance/entities/account-subcategory.entity';
import { CategorizationRule } from '../../finance/entities/categorization-rule.entity';
import { AuthModule } from '../../auth/auth.module';
import { SecurityModule } from '../../security/security.module';
import { SeedingService } from './seeding.service';
import { RolesSeed } from './roles.seed';
import { AdminSeed } from './admin.seed';
import { PlansSeed } from './plans.seed';
import { FinancialCategoriesSeed } from './financial-categories.seed';
import { CategorizationRulesSeed } from './categorization-rules.seed';
import { SystemSettingsSeed } from './system-settings.seed';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Plan,
      SystemSetting,
      AccountCategory,
      AccountSubCategory,
      CategorizationRule,
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
    CategorizationRulesSeed,
    SystemSettingsSeed,
  ],
  exports: [SeedingService],
})
export class SeedsModule {}
