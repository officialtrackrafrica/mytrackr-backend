import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { Asset } from './entities/asset.entity';
import { Liability } from './entities/liability.entity';
import { CategorizationRule } from './entities/categorization-rule.entity';
import { BankAccount } from './entities/bank-account.entity';
import { Transaction } from './entities/transaction.entity';
import { CategorizationService } from './services/categorization.service';
import { CsvUploadService } from './services/csv-upload.service';
import { PdfUploadService } from './services/pdf-upload.service';
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
    BusinessModule,
    PaymentsModule,
  ],
  controllers: [FinanceController],
  providers: [CategorizationService, CsvUploadService, PdfUploadService],
  exports: [
    TypeOrmModule,
    CategorizationService,
    CsvUploadService,
    PdfUploadService,
  ],
})
export class FinanceModule {}
