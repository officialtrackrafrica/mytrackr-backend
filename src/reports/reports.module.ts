import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PnlService } from './services/pnl.service';
import { CashFlowService } from './services/cash-flow.service';
import { BalanceSheetService } from './services/balance-sheet.service';
import { AnalyticsService } from './services/analytics.service';
import { ReportsController } from './reports.controller';
import { Asset } from '../finance/entities/asset.entity';
import { Liability } from '../finance/entities/liability.entity';
import { BankAccount } from '../finance/entities/bank-account.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { PaymentsModule } from '../payments/payments.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Asset, Liability, BankAccount, Transaction]),
    PaymentsModule,
    BusinessModule,
  ],
  controllers: [ReportsController],
  providers: [PnlService, CashFlowService, BalanceSheetService, AnalyticsService],
  exports: [PnlService, CashFlowService, BalanceSheetService, AnalyticsService],
})
export class ReportsModule {}
