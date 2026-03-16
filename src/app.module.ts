import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SecurityModule } from './security/security.module';
import { CaslModule } from './casl/casl.module';
import { SeedsModule } from './database/seeds/seeds.module';
import { DatabaseConfigService } from './config/database.config';
import { MonoModule } from './mono/mono.module';
import { RedisModule } from './common/redis';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { BusinessModule } from './business/business.module';
import { FinanceModule } from './finance/finance.module';
import { TaxModule } from './tax/tax.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfigService,
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        const redisOptions = {
          maxRetriesPerRequest: 3,
        };
        const redisClient = url
          ? new Redis(url, redisOptions)
          : new Redis({
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              ...redisOptions,
            });

        await redisClient.ping();

        return {
          throttlers: [{ ttl: 60_000, limit: 60 }],
          storage: new ThrottlerStorageRedisService(redisClient),
        };
      },
    }),
    RedisModule,
    AuthModule,
    SecurityModule,
    CaslModule,
    SeedsModule,
    MonoModule,
    AdminModule,
    PaymentsModule,
    BusinessModule,
    FinanceModule,
    TaxModule,
    DashboardModule,
    ReportsModule,
    StorageModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
