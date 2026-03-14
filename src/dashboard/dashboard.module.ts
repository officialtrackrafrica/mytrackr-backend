import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './services/dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Transaction } from '../finance/entities/transaction.entity';
import { BankAccount } from '../finance/entities/bank-account.entity';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, BankAccount]),
    PaymentsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
