import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  User,
  Session,
  RevokedToken,
  WebAuthnCredential,
  Role,
} from './entities';
import { Business } from '../business/entities/business.entity';
import { AuthService, SessionService, RolesService } from './services';
import { MfaService } from './services/mfa.service';
import {
  AuthController,
  SessionController,
  UserController,
  RolesController,
  AdminController,
} from './controllers';
import { MfaController } from './controllers/mfa.controller';
import { JwtStrategy, GoogleStrategy } from './strategies';
import { JwtAuthGuard } from './guards';
import { SecurityModule } from '../security/security.module';
import { CaslModule } from '../casl/casl.module';
import { RedisModule, TokenBlacklistService } from '../common/redis';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      RevokedToken,
      WebAuthnCredential,
      Role,
      Business,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    SecurityModule,
    CaslModule,
    RedisModule,
    StorageModule,
  ],
  controllers: [
    AuthController,
    SessionController,
    UserController,
    RolesController,
    AdminController,
    MfaController,
  ],
  providers: [
    AuthService,
    SessionService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    RolesService,
    MfaService,
    TokenBlacklistService,
  ],
  exports: [
    AuthService,
    SessionService,
    JwtAuthGuard,
    RolesService,
    TokenBlacklistService,
  ],
})
export class AuthModule {}
