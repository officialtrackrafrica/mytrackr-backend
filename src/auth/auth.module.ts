import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

// Entities
import {
  User,
  Session,
  RevokedToken,
  WebAuthnCredential,
  Role,
} from './entities';

// Services
import { AuthService, SessionService, RolesService } from './services';
import { MfaService } from './services/mfa.service';

// Controllers
import {
  AuthController,
  SessionController,
  UserController,
  RolesController,
  AdminController,
} from './controllers';
import { MfaController } from './controllers/mfa.controller';

// Strategies & Guards
import { JwtStrategy, GoogleStrategy } from './strategies';
import { JwtAuthGuard } from './guards';

// Security Module
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      RevokedToken,
      WebAuthnCredential,
      Role,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    SecurityModule,
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
  ],
  exports: [AuthService, SessionService, JwtAuthGuard, RolesService],
})
export class AuthModule {}
