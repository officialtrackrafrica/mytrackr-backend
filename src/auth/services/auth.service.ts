import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../entities';
import { SessionService } from './session.service';
import { RolesService } from './roles.service';
import { MfaService } from './mfa.service';
import { EncryptionService } from '../../security/encryption.service';
import { AuthError } from '../../common/errors';
import {
  UnifiedLoginDto,
  EmailLoginDto,
  RefreshDto,
  LoginResponseDto,
  RefreshResponseDto,
  UserResponseDto,
  RegisterDto,
  RegisterResponseDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto';
import { RegisterWithEmailDto } from '../dto/register-email.dto';
import { RegisterWithGoogleDto } from '../dto/register-google.dto';

interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  accessJti: string;
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
    private rolesService: RolesService,
    private mfaService: MfaService,
  ) {}

  async loginWithEmail(
    loginDto: EmailLoginDto,
    deviceInfo?: any,
  ): Promise<LoginResponseDto> {
    const { email, password } = loginDto;
    const user = await this.usersRepository.findOne({
      where: { email },
      relations: ['roles'],
    });
    return this.validateAndLoginUser(user, password, deviceInfo);
  }

  // @deprecated Use loginWithEmail instead
  async login(loginDto: UnifiedLoginDto): Promise<LoginResponseDto> {
    const { email, password, deviceInfo } = loginDto;

    const user = await this.usersRepository.findOne({
      where: { email },
      relations: ['roles'],
    });

    return this.validateAndLoginUser(user, password, deviceInfo);
  }

  private async validateAndLoginUser(
    user: User | null,
    password?: string,
    deviceInfo?: any,
  ): Promise<LoginResponseDto> {
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

    // Verify password
    if (!user.passwordHash) {
      // Account was created via Google OAuth — guide user to the right method
      if (user.googleId) {
        throw new AuthError(
          'GOOGLE_ACCOUNT',
          'This account uses Google sign-in. Please sign in with Google.',
          400,
        );
      }
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    // Check verification status
    if (!user.isVerified) {
      throw new AuthError(
        'NOT_VERIFIED',
        'Account is not verified. Please verify your email/phone.',
        403,
      );
    }

    // Self-healing: Ensure verified user has 'User' role
    if (user.roles && !user.roles.some((role) => role.name === 'User')) {
      await this.rolesService.assignRoleToUser(user.id, 'User');
      // Reload user with new roles to ensure token/session has correct info if needed
      // (though roles aren't in the token payload usually, they are in the session-user object returned)
      const updatedUser = await this.usersRepository.findOne({
        where: { id: user.id },
        relations: ['roles'],
      });
      if (updatedUser) {
        user = updatedUser;
      }
    }

    const isValidPassword = await this.encryptionService.verifyPassword(
      password!,
      user.passwordHash,
    );

    if (!isValidPassword) {
      // Increment failed attempts
      await this.incrementFailedAttempts(user);
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
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

    // Revoke all previous sessions and blacklist old tokens BEFORE issuing new ones
    await this.sessionService.revokeAndBlacklistAllForUser(user.id);

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
    const refreshJti = uuidv4();
    const accessJti = uuidv4();

    const accessTokenPayload: TokenPayload = {
      sub: userId,
      sessionId,
      type: 'access',
      jti: accessJti,
      deviceId,
    };

    const refreshTokenPayload: TokenPayload = {
      sub: userId,
      sessionId,
      type: 'refresh',
      jti: refreshJti,
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

    // Track refresh token JTI for revocation
    await this.sessionService.storeTokenId(refreshJti, userId, sessionId);
    // Also track access token JTI so we can bulk-blacklist on password change
    await this.sessionService.storeTokenId(accessJti, userId, sessionId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      accessJti,
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
      // Auto-assign default User role
      await this.rolesService.assignRoleToUser(savedUser.id, 'User');
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

    // Auto-assign default User role
    await this.rolesService.assignRoleToUser(user.id, 'User');

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

  async resendVerification(emailOrPhone: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    });

    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.isVerified) {
      throw new AuthError('ALREADY_VERIFIED', 'User is already verified', 400);
    }

    const verificationCode = this.generateOTP();
    const verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.usersRepository.update(user.id, {
      verificationCode,
      verificationCodeExpiresAt,
    });

    // Mock sending OTP
    if (user.email) {
      console.log(
        `[OTP] Resending verification code to ${user.email}: ${verificationCode}`,
      );
    } else if (user.phone) {
      console.log(
        `[OTP] Resending verification code to ${user.phone}: ${verificationCode}`,
      );
    }

    return {
      message: `Verification code sent to ${user.email || user.phone}`,
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const { oldPassword, newPassword } = dto;
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user || !user.passwordHash) {
      throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    const isMatch = await this.encryptionService.verifyPassword(
      oldPassword,
      user.passwordHash,
    );

    if (!isMatch) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid current password');
    }

    const passwordHash = await this.encryptionService.hashPassword(newPassword);

    await this.usersRepository.update(user.id, {
      passwordHash,
      securitySettings: {
        ...user.securitySettings,
        lastPasswordChange: new Date(),
        mfaEnabled: user.securitySettings?.mfaEnabled ?? false,
      },
    });

    // Revoke all sessions AND instantly blacklist all active access tokens
    await this.sessionService.revokeAndBlacklistAllForUser(userId);

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = dto;
    const user = await this.usersRepository.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists
      return { message: 'If email exists, a reset link has been sent' };
    }

    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.usersRepository.update(user.id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires,
    });

    // Mock Email Sending
    console.log(
      `[Email] Password reset link for ${email}: https://mytrackr.com/reset-password?token=${resetToken}`,
    );

    return { message: 'If email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = dto;

    const user = await this.usersRepository.findOne({
      where: { resetPasswordToken: token },
    });

    if (
      !user ||
      !user.resetPasswordExpires ||
      new Date() > user.resetPasswordExpires
    ) {
      throw new AuthError(
        'INVALID_TOKEN',
        'Invalid or expired reset token',
        400,
      );
    }

    const passwordHash = await this.encryptionService.hashPassword(newPassword);

    await this.usersRepository.update(user.id, {
      passwordHash,
      resetPasswordToken: null as any,
      resetPasswordExpires: null as any,
      securitySettings: {
        ...user.securitySettings,
        lastPasswordChange: new Date(),
        mfaEnabled: user.securitySettings?.mfaEnabled ?? false,
      },
    });

    // Revoke all sessions AND instantly blacklist all active access tokens in Redis
    await this.sessionService.revokeAndBlacklistAllForUser(user.id);

    return { message: 'Password reset successfully' };
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ─── Split Registration Methods ──────────────────────────────────

  async registerWithEmail(
    dto: RegisterWithEmailDto,
  ): Promise<RegisterResponseDto> {
    const { email, password, firstName, lastName, businessName } = dto;

    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new AuthError(
        'USER_EXISTS',
        'User with this email already exists',
        400,
      );
    }

    const passwordHash = await this.encryptionService.hashPassword(password);
    const verificationCode = this.generateOTP();
    const verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const newUser = this.usersRepository.create({
      email,
      passwordHash,
      firstName,
      lastName,
      businessName,
      isVerified: false,
      isActive: false,
      verificationCode,
      verificationCodeExpiresAt,
      securitySettings: { mfaEnabled: false },
    });

    await this.usersRepository.save(newUser);
    console.log(
      `[OTP] Sending verification code to ${email}: ${verificationCode}`,
    );

    return {
      success: true,
      message: `Verification code sent to ${email}`,
      requiresVerification: true,
    };
  }

  async registerWithGoogle(
    dto: RegisterWithGoogleDto,
  ): Promise<RegisterResponseDto> {
    const { googleIdToken, firstName, lastName } = dto;

    // In production, verify googleIdToken with Google API
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
    await this.rolesService.assignRoleToUser(savedUser.id, 'User');
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

  async googleLogin(user: User): Promise<{
    tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    loginResponse: LoginResponseDto;
  }> {
    if (!user) {
      throw new AuthError('GOOGLE_AUTH_FAILED', 'Google authentication failed');
    }

    // Ensure merged accounts are fully active and verified
    if (!user.isVerified || !user.isActive) {
      await this.usersRepository.update(user.id, {
        isVerified: true,
        isActive: true,
      });
      user.isVerified = true;
      user.isActive = true;
    }

    // Assign User role if not already set
    if (!user.roles || !user.roles.some((role) => role.name === 'User')) {
      await this.rolesService.assignRoleToUser(user.id, 'User');
    }

    const session = await this.sessionService.createSession(user.id);
    const tokens = await this.generateTokens(user.id, session.id);

    return {
      tokens,
      loginResponse: {
        requiresMFA: false,
        user: this.sanitizeUser(user),
        expiresIn: tokens.expiresIn,
      },
    };
  }

  // ─── MFA Login Verification ──────────────────────────────────────

  async verifyMfaLogin(
    sessionId: string,
    token: string,
  ): Promise<LoginResponseDto> {
    // Find the session to get the user
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new AuthError('INVALID_SESSION', 'Invalid MFA session', 400);
    }

    // Verify TOTP or backup code
    const isValid = await this.mfaService.verifyToken(session.userId, token);
    if (!isValid) {
      throw new AuthError(
        'INVALID_MFA_TOKEN',
        'Invalid verification code',
        401,
      );
    }

    // Generate tokens
    const tokens = await this.generateTokens(session.userId, session.id);

    const user = await this.usersRepository.findOne({
      where: { id: session.userId },
    });

    return {
      requiresMFA: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: user ? this.sanitizeUser(user) : undefined,
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * Blacklist a single access token JTI.
   * Called by the logout endpoint to instantly invalidate the current token.
   */
  async blacklistToken(jti: string): Promise<void> {
    await this.sessionService.revokeToken(jti);
  }

  sanitizeUser(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      businessName: user.businessName,
      profilePicture: user.profilePicture,
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
