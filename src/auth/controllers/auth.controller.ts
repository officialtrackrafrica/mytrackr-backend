import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

interface ExpressResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): this;
  clearCookie(name: string): this;
  redirect(url: string): void;
}
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthService } from '../services';
import {
  EmailLoginDto,
  RefreshDto,
  LoginResponseDto,
  RefreshResponseDto,
  RegisterResponseDto,
  VerifyRegistrationDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto';
import { RegisterWithEmailDto } from '../dto/register-email.dto';
import { RateLimitGuard, RateLimit } from '../../common/guards';
import { AuthError } from '../../common/errors';
import { SWAGGER_TAGS } from '../../common/docs';
import { GoogleAuthGuard, JwtAuthGuard } from '../guards';

const COOKIE_OPTS_ACCESS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000,
};

const COOKIE_OPTS_REFRESH = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setCookies(
  res: ExpressResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie(
    'accessToken',
    tokens.accessToken,
    COOKIE_OPTS_ACCESS as Record<string, unknown>,
  );
  res.cookie(
    'refreshToken',
    tokens.refreshToken,
    COOKIE_OPTS_REFRESH as Record<string, unknown>,
  );
}

function clearCookies(res: ExpressResponse) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

@ApiTags(SWAGGER_TAGS[1].name)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register/email')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({ summary: 'Register with email and password' })
  @ApiBody({ type: RegisterWithEmailDto })
  @ApiResponse({
    status: 201,
    description: 'Verification code sent to email',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'User already exists or validation error',
  })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async registerWithEmail(
    @Body() dto: RegisterWithEmailDto,
  ): Promise<RegisterResponseDto> {
    try {
      return await this.authService.registerWithEmail(dto);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'REGISTRATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('verify-otp')
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({ summary: 'Verify registration with OTP code' })
  @ApiBody({ type: VerifyRegistrationDto })
  @ApiResponse({
    status: 200,
    description: 'Verification successful — access/refresh cookies set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async verifyRegistration(
    @Body() verifyDto: VerifyRegistrationDto,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<LoginResponseDto> {
    try {
      const result = await this.authService.verifyRegistration(
        verifyDto.email,
        verifyDto.code,
      );
      if (result.accessToken && result.refreshToken) {
        setCookies(res, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { accessToken: _at1, refreshToken: _rt1, ...safeResult } = result;
        return safeResult as LoginResponseDto;
      }
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'VERIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('resend-otp')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Verification code resent' })
  @ApiResponse({
    status: 400,
    description: 'User already verified or not found',
  })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    try {
      return await this.authService.resendVerification(dto.emailOrPhone);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'RESEND_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({
    summary: 'Request password reset — magic link sent to email',
    description:
      'Sends a magic link to the provided email. The link contains a `token` query param to use with `POST /auth/reset-password`.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Reset link sent if email exists' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return await this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({
    summary: 'Reset password using magic link token',
    description:
      'Pass the `token` from the magic link email plus the new password. All existing sessions are revoked after reset.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    try {
      return await this.authService.resetPassword(dto);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'RESET_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('login/email')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: EmailLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful — access/refresh cookies set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async loginWithEmail(
    @Body() loginDto: EmailLoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<LoginResponseDto> {
    try {
      const deviceInfo = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };
      const result = await this.authService.loginWithEmail(
        loginDto,
        deviceInfo,
      );

      if (result.accessToken && result.refreshToken) {
        setCookies(res, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { accessToken: _at2, refreshToken: _rt2, ...safeResult } = result;
        return safeResult as LoginResponseDto;
      }
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'LOGIN_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /* MFA is disabled for now
  @Post('verify-mfa')
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 100 })
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 100 } })
  @ApiOperation({ summary: 'Verify MFA code to complete login' })
  @ApiBody({ type: VerifyMfaDto })
  @ApiResponse({
    status: 200,
    description: 'MFA verification successful — access/refresh cookies set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid MFA token' })
  async verifyMfa(
    @Body() verifyMfaDto: any,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<LoginResponseDto> {
    try {
      const result = await this.authService.verifyMfaLogin(
        verifyMfaDto.sessionId,
        verifyMfaDto.token,
      );
      if (result.accessToken && result.refreshToken) {
        setCookies(res, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { accessToken: _at3, refreshToken: _rt3, ...safeResult } = result;
        return safeResult as LoginResponseDto;
      }
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'MFA_VERIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
  */

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiCookieAuth('refreshToken')
  @ApiResponse({
    status: 200,
    description: 'Token refreshed — new cookies set',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: Partial<RefreshDto>,
  ): Promise<RefreshResponseDto> {
    try {
      const refreshToken = req.cookies?.refreshToken || body.refreshToken;
      if (!refreshToken) {
        throw new AuthError('TOKEN_MISSING', 'Refresh token is required', 401);
      }
      const result = await this.authService.refreshToken({
        refreshToken,
        deviceId: body.deviceId,
      });
      setCookies(res, {
        accessToken: result.accessToken!,
        refreshToken: result.refreshToken!,
      });
      return { expiresIn: result.expiresIn };
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'TOKEN_REFRESH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout — clear auth cookies and blacklist token' })
  @ApiCookieAuth('accessToken')
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<{ message: string }> {
    const jti: string | undefined = req.user?.accessJti;
    if (jti) {
      await this.authService.blacklistToken(jti);
    }
    clearCookies(res);
    return { message: 'Logged out successfully' };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Initiate Google OAuth login / registration',
    description:
      'Redirects the user to Google to authenticate. Can be used for both signing up a new account or logging into an existing one.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google' })
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Google OAuth callback — sets auth cookies',
    description:
      'The callback URL Google redirects to after successful authentication. If the user is new, it automatically provisions an account and a default business. Sets secure HTTP-only cookies for access and refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Google login successful — cookies set',
    type: LoginResponseDto,
  })
  async googleAuthRedirect(
    @Req() req: any,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const { tokens } = await this.authService.googleLogin(req.user);
    setCookies(res, tokens);
    const redirectUrl = process.env.GOOGLE_REDIRECT_URL || '/';
    res.redirect(redirectUrl);
  }
}
