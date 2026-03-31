import { Module } from '@nestjs/common';
import { MonoService } from './mono.service';
import { MonoController } from './mono.controller';
import { TransactionSyncService } from './services/transaction-sync.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { MonoAccount } from './entities/mono-account.entity';
import { Transaction } from './entities/transaction.entity';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsModule } from '../payments/payments.module';
import { CategorizationModule } from '../categorization/categorization.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, MonoAccount, Transaction]),
    FinanceModule,
    PaymentsModule,
    CategorizationModule,
    BusinessModule,
  ],
  providers: [MonoService, TransactionSyncService],
  controllers: [MonoController],
  exports: [MonoService, TransactionSyncService],
})
export class MonoModule {}
