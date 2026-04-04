import { Module } from '@nestjs/common';
import { MonoService } from './mono.service';
import { MonoController } from './mono.controller';
import { TransactionSyncService } from './services/transaction-sync.service';

import { forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { MonoAccount } from './entities/mono-account.entity';
import { Transaction } from './entities/transaction.entity';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsModule } from '../payments/payments.module';
import { CategorizationModule } from '../categorization/categorization.module';
import { BusinessModule } from '../business/business.module';
import { AccountCategory } from '../finance/entities/account-category.entity';
import { AccountSubCategory } from '../finance/entities/account-subcategory.entity';

import { MonoFinanceController } from './mono-finance.controller';
import { MonoAdminController } from './mono-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      MonoAccount,
      Transaction,
      AccountCategory,
      AccountSubCategory,
    ]),
    forwardRef(() => FinanceModule),
    PaymentsModule,
    CategorizationModule,
    BusinessModule,
  ],
  providers: [MonoService, TransactionSyncService],
  controllers: [MonoController, MonoFinanceController, MonoAdminController],
  exports: [MonoService, TransactionSyncService],
})
export class MonoModule {}
