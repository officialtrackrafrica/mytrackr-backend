import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { Business } from '../business/entities/business.entity';
import { WebhookLog } from '../admin/entities/webhook-log.entity';
import { Integration } from '../integrations/entities/integration.entity';
import { IntegrationEvent } from '../integrations/entities/integration-event.entity';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PaymentsModule } from '../payments/payments.module';
import { SecurityModule } from '../security/security.module';
import { DashboardAuthGuard } from './dashboard-auth.guard';
import { DashboardExceptionFilter } from './dashboard-exception.filter';
import { DashboardSecurityService } from './dashboard-security.service';
import { ApiDashboardService } from './dashboard.service';
import {
  ApiDashboardController,
  DashboardPublicController,
} from './dashboard.controller';

@Module({
  imports: [
    AuthModule,
    IntegrationsModule,
    PaymentsModule,
    SecurityModule,
    TypeOrmModule.forFeature([
      Integration,
      IntegrationEvent,
      WebhookLog,
      User,
      Business,
    ]),
  ],
  controllers: [DashboardPublicController, ApiDashboardController],
  providers: [
    ApiDashboardService,
    DashboardSecurityService,
    DashboardAuthGuard,
    DashboardExceptionFilter,
  ],
})
export class ApiDashboardModule {}
