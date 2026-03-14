import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from './entities/asset.entity';
import { Liability } from './entities/liability.entity';
import { CategorizationRule } from './entities/categorization-rule.entity';
import { BankAccount } from './entities/bank-account.entity';
import { Transaction } from './entities/transaction.entity';
import { CategorizationService } from './services/categorization.service';
import { FinanceController } from './finance.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Asset,
      Liability,
      CategorizationRule,
      BankAccount,
      Transaction,
    ]),
    PaymentsModule,
  ],
  controllers: [FinanceController],
  providers: [CategorizationService],
  exports: [TypeOrmModule, CategorizationService],
})
export class FinanceModule {}
