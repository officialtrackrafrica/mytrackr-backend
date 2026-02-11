import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../entities';
import { SessionService } from './session.service';
import { EncryptionService } from '../../security/encryption.service';
import { AuthError } from '../../common/errors';
import {
  UnifiedLoginDto,
  RefreshDto,
  LoginResponseDto,
  RefreshResponseDto,
  UserResponseDto,
  RegisterDto,
  RegisterResponseDto,
} from '../dto';

interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface TokenPayload {
  sub: string;
  sessionId: string;
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  deviceId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private sessionService: SessionService,
    private encryptionService: EncryptionService,
  ) {}

  async login(loginDto: UnifiedLoginDto): Promise<LoginResponseDto> {
    const { method, identifier, credential, deviceInfo } = loginDto;

    let user: User | null = null;

    switch (method) {
      case 'email':
        user = await this.usersRepository.findOne({
          where: { email: identifier },
        });
        break;
      case 'phone':
        user = await this.usersRepository.findOne({
          where: { phone: identifier },
        });
        break;
      case 'google':
        user = await this.usersRepository.findOne({
          where: { googleId: identifier },
        });
        break;
      default:
        throw new AuthError(
          'INVALID_AUTH_METHOD',
          'Invalid authentication method',
        );
    }

    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    // Check if account is locked
    if (user.securitySettings?.lockoutUntil) {
      const lockoutUntil = new Date(user.securitySettings.lockoutUntil);
      if (lockoutUntil > new Date()) {
        throw new AuthError('ACCOUNT_LOCKED', 'Account is temporarily locked');
      }
    }

    // Verify password for email/phone auth
    if (method === 'email' || method === 'phone') {
      if (!user.passwordHash) {
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
      }

      const isValidPassword = await this.encryptionService.verifyPassword(
        credential,
        user.passwordHash,
      );

      if (!isValidPassword) {
        // Increment failed attempts
        await this.incrementFailedAttempts(user);
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
      }
    }

    // Reset failed attempts on successful login
    if (user.securitySettings?.failedLoginAttempts) {
      await this.usersRepository.update(user.id, {
        securitySettings: {
          ...user.securitySettings,
          failedLoginAttempts: 0,
          lockoutUntil: undefined,
        },
      });
    }

    // Check if MFA is required
    if (user.securitySettings?.mfaEnabled) {
      // Create pending session for MFA
      const session = await this.sessionService.createSession(
        user.id,
        deviceInfo,
      );

      return {
        requiresMFA: true,
        mfaSessionId: session.id,
      };
    }

    // Create session and generate tokens
    const session = await this.sessionService.createSession(
      user.id,
      deviceInfo,
      deviceInfo?.ipAddress,
    );

    const tokens = await this.generateTokens(
      user.id,
      session.id,
      deviceInfo?.deviceId,
    );

    return {
      requiresMFA: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
      expiresIn: tokens.expiresIn,
    };
  }

  async refreshToken(refreshDto: RefreshDto): Promise<RefreshResponseDto> {
    const { refreshToken, deviceId } = refreshDto;

    let payload: TokenPayload;

    try {
      payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new AuthError('TOKEN_INVALID', 'Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new AuthError('TOKEN_INVALID', 'Invalid token type');
    }

    // Check if token is revoked
    if (payload.jti) {
      const isRevoked = await this.sessionService.isTokenRevoked(payload.jti);
      if (isRevoked) {
        throw new AuthError('TOKEN_REVOKED', 'Token has been revoked');
      }
    }

    // Check device mismatch
    if (deviceId && payload.deviceId && payload.deviceId !== deviceId) {
      throw new AuthError('DEVICE_MISMATCH', 'Device ID does not match');
    }

    // Get user
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found');
    }

    // Check if password was changed after token issuance
    const passwordChangedAt = user.securitySettings?.lastPasswordChange;
    if (
      passwordChangedAt &&
      payload.iat &&
      new Date(passwordChangedAt) > new Date(payload.iat * 1000)
    ) {
      await this.sessionService.revokeAllUserSessions(user.id);
      throw new AuthError(
        'PASSWORD_CHANGED',
        'Password was changed, please login again',
      );
    }

    // Get session
    const session = await this.sessionService.getSession(payload.sessionId);
    if (!session) {
      throw new AuthError('SESSION_NOT_FOUND', 'Session not found');
    }

    // Rotate refresh token - revoke old one
    if (payload.jti) {
      await this.sessionService.revokeToken(payload.jti);
    }

    // Generate new tokens
    const newTokens = await this.generateTokens(user.id, session.id, deviceId);

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn,
    };
  }

  async generateTokens(
    userId: string,
    sessionId: string,
    deviceId?: string,
  ): Promise<TokenResult> {
    const jti = uuidv4();

    const accessTokenPayload: TokenPayload = {
      sub: userId,
      sessionId,
      type: 'access',
      deviceId,
    };

    const refreshTokenPayload: TokenPayload = {
      sub: userId,
      sessionId,
      type: 'refresh',
      jti,
      deviceId,
    };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    // Store token ID for revocation tracking
    await this.sessionService.storeTokenId(jti, userId, sessionId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  async register(registerDto: RegisterDto): Promise<RegisterResponseDto> {
    const {
      method,
      email,
      phone,
      password,
      googleIdToken,
      firstName,
      lastName,
    } = registerDto;

    // Check if user already exists
    if (method === 'email' && email) {
      const existing = await this.usersRepository.findOne({ where: { email } });
      if (existing) {
        throw new AuthError(
          'USER_EXISTS',
          'User with this email already exists',
          400,
        );
      }
    } else if (method === 'phone' && phone) {
      const existing = await this.usersRepository.findOne({ where: { phone } });
      if (existing) {
        throw new AuthError(
          'USER_EXISTS',
          'User with this phone already exists',
          400,
        );
      }
    }

    // Google registration - auto-verified
    if (method === 'google') {
      // In production, verify googleIdToken with Google API
      // For now, we mock this by extracting a fake googleId
      const googleId = googleIdToken || `google_${Date.now()}`;

      const existing = await this.usersRepository.findOne({
        where: { googleId },
      });
      if (existing) {
        throw new AuthError(
          'USER_EXISTS',
          'User with this Google account already exists',
          400,
        );
      }

      const newUser = this.usersRepository.create({
        googleId,
        firstName,
        lastName,
        isVerified: true,
        isActive: true,
        securitySettings: { mfaEnabled: false },
      });

      const savedUser = await this.usersRepository.save(newUser);
      const session = await this.sessionService.createSession(savedUser.id);
      const tokens = await this.generateTokens(savedUser.id, session.id);

      return {
        success: true,
        message: 'Registration successful',
        requiresVerification: false,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
    }

    // Email or Phone registration - requires OTP verification
    const passwordHash = await this.encryptionService.hashPassword(password!);
    const verificationCode = this.generateOTP();
    const verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const newUser = this.usersRepository.create({
      email: method === 'email' ? email : undefined,
      phone: method === 'phone' ? phone : undefined,
      passwordHash,
      firstName,
      lastName,
      isVerified: false,
      isActive: false,
      verificationCode,
      verificationCodeExpiresAt,
      securitySettings: { mfaEnabled: false },
    });

    await this.usersRepository.save(newUser);

    // Mock sending OTP (in production, integrate with SMS/email service)
    console.log(
      `[OTP] Sending verification code to ${email || phone}: ${verificationCode}`,
    );

    return {
      success: true,
      message: `Verification code sent to ${method === 'email' ? email : phone}`,
      requiresVerification: true,
    };
  }

  async verifyRegistration(
    emailOrPhone: string,
    code: string,
  ): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findOne({
      where: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.isVerified) {
      throw new AuthError('ALREADY_VERIFIED', 'User is already verified', 400);
    }

    if (!user.verificationCode || user.verificationCode !== code) {
      throw new AuthError('INVALID_CODE', 'Invalid verification code', 400);
    }

    if (
      user.verificationCodeExpiresAt &&
      new Date() > user.verificationCodeExpiresAt
    ) {
      throw new AuthError('CODE_EXPIRED', 'Verification code has expired', 400);
    }

    // Mark user as verified
    await this.usersRepository.update(user.id, {
      isVerified: true,
      isActive: true,
      verificationCode: null as any,
      verificationCodeExpiresAt: null as any,
    });

    // Create session and return tokens
    const session = await this.sessionService.createSession(user.id);
    const tokens = await this.generateTokens(user.id, session.id);

    return {
      requiresMFA: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser({ ...user, isVerified: true }),
      expiresIn: tokens.expiresIn,
    };
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  sanitizeUser(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };
  }

  private async incrementFailedAttempts(user: User): Promise<void> {
    const failedAttempts =
      (user.securitySettings?.failedLoginAttempts || 0) + 1;
    const maxAttempts = 5;

    const updates: Partial<User['securitySettings']> = {
      ...user.securitySettings,
      failedLoginAttempts: failedAttempts,
    };

    if (failedAttempts >= maxAttempts) {
      // Lock account for 15 minutes
      updates.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    await this.usersRepository.update(user.id, {
      securitySettings: updates,
    });
  }
}
