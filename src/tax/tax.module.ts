import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxService } from './services/tax.service';
import { TaxController } from './tax.controller';
import { Business } from '../business/entities/business.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Asset } from '../finance/entities/asset.entity';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, Transaction, Asset]),
    PaymentsModule,
  ],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
