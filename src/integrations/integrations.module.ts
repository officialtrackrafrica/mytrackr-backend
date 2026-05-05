import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from '../business/business.module';
import { Transaction } from '../finance/entities/transaction.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { Plan } from '../payments/entities/plan.entity';
import { PaymentsModule } from '../payments/payments.module';
import { SecurityModule } from '../security/security.module';
import { IntegrationsController } from './controllers/integrations.controller';
import { IntegrationPlan } from './entities/integration-plan.entity';
import {
  IntegrationEvent,
  IntegrationEventItem,
} from './entities/integration-event.entity';
import { Integration } from './entities/integration.entity';
import { PaystackConnection } from './entities/paystack-connection.entity';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationsService } from './services/integrations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Integration,
      IntegrationEvent,
      IntegrationEventItem,
      IntegrationPlan,
      PaymentTransaction,
      PaystackConnection,
      Plan,
      Transaction,
    ]),
    BusinessModule,
    PaymentsModule,
    SecurityModule,
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationApiKeyGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
