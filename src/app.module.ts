import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SecurityModule } from './security/security.module';

// Entities
import {
  User,
  Session,
  RevokedToken,
  WebAuthnCredential,
} from './auth/entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'mytrackr',
      entities: [User, Session, RevokedToken, WebAuthnCredential],
      synchronize: process.env.NODE_ENV !== 'production', // Auto-sync in dev
      logging: process.env.NODE_ENV === 'development',
    }),
    AuthModule,
    SecurityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
