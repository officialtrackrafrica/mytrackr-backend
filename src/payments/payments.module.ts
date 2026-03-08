import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Entities
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';

// Services
import { SubscriptionService } from './services/subscription.service';
import { PaymentFactoryService } from './services/payment-factory.service';
import { PaystackService } from './providers/paystack.service';

// Controllers
import { SubscriptionController } from './controllers/subscription.controller';
import { WebhookController } from './controllers/webhook.controller';

// Export Guards/Interceptors for use in other modules
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { PremiumFieldInterceptor } from '../common/access-control/interceptors/premium-field.interceptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, Subscription, PaymentTransaction]),
    ConfigModule,
  ],
  controllers: [SubscriptionController, WebhookController],
  providers: [
    SubscriptionService,
    PaymentFactoryService,
    PaystackService,
    PlanGuard,
    PremiumFieldInterceptor,
  ],
  exports: [SubscriptionService, PlanGuard, PremiumFieldInterceptor],
})
export class PaymentsModule {}
