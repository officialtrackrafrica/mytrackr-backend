import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxService } from './services/tax.service';
import { TaxController } from './tax.controller';
import { Transaction } from '../finance/entities/transaction.entity';
import { Asset } from '../finance/entities/asset.entity';
import { PaymentsModule } from '../payments/payments.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Asset]),
    PaymentsModule,
    BusinessModule,
  ],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
