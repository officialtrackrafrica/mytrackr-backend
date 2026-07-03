import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import {
  AuditLog,
  SystemSetting,
  SupportTicket,
  SupportTicketReply,
  Dispute,
  WebhookLog,
  AdminMessage,
  AdminMessageTemplate,
  Faq,
} from './entities';

import { User } from '../auth/entities/user.entity';
import { Session } from '../auth/entities/session.entity';
import { Role } from '../auth/entities/role.entity';
import { MonoTransaction } from '../mono/entities/transaction.entity';
import { MonoAccount } from '../mono/entities/mono-account.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Subscription } from '../payments/entities/subscription.entity';
import { Plan } from '../payments/entities/plan.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { Business } from '../business/entities/business.entity';
import { BankAccount } from '../finance/entities/bank-account.entity';
import { CategorizationRule } from '../finance/entities/categorization-rule.entity';

import {
  AdminUsersService,
  AdminDashboardService,
  AdminFinanceService,
  AdminAuditService,
  AdminSystemService,
  AdminMessagingService,
  AdminFaqService,
  AdminCategorizationRulesService,
} from './services';

import {
  AdminUsersController,
  AdminDashboardController,
  AdminFinanceController,
  AdminSupportController,
  AdminOpsController,
  SupportController,
  AdminMessagingController,
  AdminFaqController,
  AdminCategorizationRulesController,
} from './controllers';

import { CaslModule } from '../casl/casl.module';
import { SecurityModule } from '../security/security.module';
import { StorageModule } from '../storage/storage.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLog,
      SystemSetting,
      SupportTicket,
      SupportTicketReply,
      Dispute,
      WebhookLog,
      AdminMessage,
      AdminMessageTemplate,
      Faq,
      User,
      Session,
      Role,
      MonoTransaction,
      MonoAccount,
      Transaction,
      Subscription,
      Plan,
      PaymentTransaction,
      Business,
      BankAccount,
      CategorizationRule,
    ]),
    ConfigModule,
    CaslModule,
    SecurityModule,
    StorageModule,
    IntegrationsModule,
    PaymentsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminDashboardController,
    AdminFinanceController,
    AdminSupportController,
    AdminOpsController,
    SupportController,
    AdminMessagingController,
    AdminFaqController,
    AdminCategorizationRulesController,
  ],
  providers: [
    AdminUsersService,
    AdminDashboardService,
    AdminFinanceService,
    AdminAuditService,
    AdminSystemService,
    AdminMessagingService,
    AdminFaqService,
    AdminCategorizationRulesService,
  ],
  exports: [AdminAuditService, AdminSystemService],
})
export class AdminModule {}
