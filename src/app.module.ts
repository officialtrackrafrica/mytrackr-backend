import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SecurityModule } from './security/security.module';
import { CaslModule } from './casl/casl.module';
import { SeedsModule } from './database/seeds/seeds.module';
import { DatabaseConfigService } from './config/database.config';
import { MonoModule } from './mono/mono.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfigService,
      inject: [ConfigService],
    }),
    AuthModule,
    SecurityModule,
    CaslModule,
    SeedsModule,
    MonoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
