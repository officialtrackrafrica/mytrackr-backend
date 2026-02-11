import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

// Entities
import { User, Session, RevokedToken, WebAuthnCredential } from './entities';

// Services
import { AuthService, SessionService } from './services';

// Controllers
import {
  AuthController,
  SessionController,
  UserController,
} from './controllers';

// Strategies & Guards
import { JwtStrategy } from './strategies';
import { JwtAuthGuard } from './guards';

// Security Module
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, RevokedToken, WebAuthnCredential]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    SecurityModule,
  ],
  controllers: [AuthController, SessionController, UserController],
  providers: [AuthService, SessionService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, SessionService, JwtAuthGuard],
})
export class AuthModule {}
