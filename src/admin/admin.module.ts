import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import {
  AuditLog,
  SystemSetting,
  NotificationTemplate,
  SupportTicket,
  Dispute,
  WebhookLog,
} from './entities';

import { User } from '../auth/entities/user.entity';
import { Session } from '../auth/entities/session.entity';
import { Role } from '../auth/entities/role.entity';
import { Transaction } from '../mono/entities/transaction.entity';
import { MonoAccount } from '../mono/entities/mono-account.entity';

import {
  AdminUsersService,
  AdminDashboardService,
  AdminFinanceService,
  AdminAuditService,
  AdminSystemService,
} from './services';

import {
  AdminUsersController,
  AdminDashboardController,
  AdminFinanceController,
  AdminSupportController,
  AdminOpsController,
  SupportController,
} from './controllers';

import { CaslModule } from '../casl/casl.module';
import { SecurityModule } from '../security/security.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLog,
      SystemSetting,
      NotificationTemplate,
      SupportTicket,
      Dispute,
      WebhookLog,
      User,
      Session,
      Role,
      Transaction,
      MonoAccount,
    ]),
    ConfigModule,
    CaslModule,
    SecurityModule,
    StorageModule,
  ],
  controllers: [
    AdminUsersController,
    AdminDashboardController,
    AdminFinanceController,
    AdminSupportController,
    AdminOpsController,
    SupportController,
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
