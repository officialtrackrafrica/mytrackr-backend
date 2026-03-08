import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Entities from this module
import {
  AuditLog,
  SystemSetting,
  NotificationTemplate,
  SupportTicket,
  Dispute,
  WebhookLog,
} from './entities';

// Entities from other modules (needed for queries)
import { User } from '../auth/entities/user.entity';
import { Session } from '../auth/entities/session.entity';
import { Role } from '../auth/entities/role.entity';
import { Transaction } from '../mono/entities/transaction.entity';
import { MonoAccount } from '../mono/entities/mono-account.entity';

// Services
import {
  AdminUsersService,
  AdminDashboardService,
  AdminFinanceService,
  AdminAuditService,
  AdminSystemService,
} from './services';

// Controllers
import {
  AdminUsersController,
  AdminDashboardController,
  AdminFinanceController,
  AdminSupportController,
  AdminOpsController,
} from './controllers';

// Guards & CASL
import { CaslModule } from '../casl/casl.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Admin entities
      AuditLog,
      SystemSetting,
      NotificationTemplate,
      SupportTicket,
      Dispute,
      WebhookLog,
      // Shared entities for cross-module queries
      User,
      Session,
      Role,
      Transaction,
      MonoAccount,
    ]),
    ConfigModule,
    CaslModule,
    SecurityModule,
  ],
  controllers: [
    AdminUsersController,
    AdminDashboardController,
    AdminFinanceController,
    AdminSupportController,
    AdminOpsController,
  ],
  providers: [
    AdminUsersService,
    AdminDashboardService,
    AdminFinanceService,
    AdminAuditService,
    AdminSystemService,
  ],
  exports: [AdminAuditService],
})
export class AdminModule {}
