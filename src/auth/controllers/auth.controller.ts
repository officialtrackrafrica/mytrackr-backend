import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { AuthService } from '../services';
import {
  EmailLoginDto,
  PhoneLoginDto,
  RefreshDto,
  LoginResponseDto,
  RefreshResponseDto,
  VerifyMfaDto,
  RegisterResponseDto,
  VerifyRegistrationDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto';
import { RegisterWithEmailDto } from '../dto/register-email.dto';
import { RegisterWithPhoneDto } from '../dto/register-phone.dto';
import { RegisterWithGoogleDto } from '../dto/register-google.dto';
import { RateLimitGuard, RateLimit } from '../../common/guards';
import { AuthError } from '../../common/errors';
import { SWAGGER_TAGS } from '../../common/docs';
import { GoogleAuthGuard } from '../guards';

@ApiTags(SWAGGER_TAGS[1].name)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register/email')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 5 })
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

  @ApiExcludeEndpoint()
  @Post('register/phone')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Register with phone number and password' })
  @ApiBody({ type: RegisterWithPhoneDto })
  @ApiResponse({
    status: 201,
    description: 'Verification code sent to phone',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'User already exists or validation error',
  })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async registerWithPhone(
    @Body() dto: RegisterWithPhoneDto,
  ): Promise<RegisterResponseDto> {
    try {
      return await this.authService.registerWithPhone(dto);
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

  @ApiExcludeEndpoint()
  @Post('register/google')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Register with Google OAuth' })
  @ApiBody({ type: RegisterWithGoogleDto })
  @ApiResponse({
    status: 201,
    description: 'Registration successful, tokens returned',
    type: RegisterResponseDto,
  })
  @ApiResponse({ status: 400, description: 'User already exists' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async registerWithGoogle(
    @Body() dto: RegisterWithGoogleDto,
  ): Promise<RegisterResponseDto> {
    try {
      return await this.authService.registerWithGoogle(dto);
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
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Verify registration with OTP code' })
  @ApiBody({ type: VerifyRegistrationDto })
  @ApiResponse({
    status: 200,
    description: 'Verification successful, user logged in',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async verifyRegistration(
    @Body() verifyDto: VerifyRegistrationDto,
  ): Promise<LoginResponseDto> {
    try {
      return await this.authService.verifyRegistration(
        verifyDto.emailOrPhone,
        verifyDto.code,
      );
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
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 3 })
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: 200,
    description: 'Verification code resent',
  })
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
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 3 })
  @ApiOperation({ summary: 'Request password reset' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Reset link sent if email exists',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return await this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 3 })
  @ApiOperation({ summary: 'Reset password with token' })
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
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: EmailLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async loginWithEmail(
    @Body() loginDto: EmailLoginDto,
    @Req() req: any,
  ): Promise<LoginResponseDto> {
    try {
      const deviceInfo = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };
      return await this.authService.loginWithEmail(loginDto, deviceInfo);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          {
            error: error.code,
            message: error.message,
          },
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

  @ApiExcludeEndpoint()
  @Post('login/phone')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Login with phone number and password' })
  @ApiBody({ type: PhoneLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async loginWithPhone(
    @Body() loginDto: PhoneLoginDto,
    @Req() req: any,
  ): Promise<LoginResponseDto> {
    try {
      const deviceInfo = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };
      return await this.authService.loginWithPhone(loginDto, deviceInfo);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          {
            error: error.code,
            message: error.message,
          },
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

  @Post('verify-mfa')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Verify MFA code to complete login' })
  @ApiBody({ type: VerifyMfaDto })
  @ApiResponse({
    status: 200,
    description: 'MFA verification successful, tokens returned',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid MFA token' })
  async verifyMfa(
    @Body() verifyMfaDto: VerifyMfaDto,
  ): Promise<LoginResponseDto> {
    try {
      return await this.authService.verifyMfaLogin(
        verifyMfaDto.sessionId,
        verifyMfaDto.token,
      );
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

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshDto: RefreshDto): Promise<RefreshResponseDto> {
    try {
      return await this.authService.refreshToken(refreshDto);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          {
            error: error.code,
            message: error.message,
          },
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

  @ApiExcludeEndpoint()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Google' })
  googleAuth() {}

  @ApiExcludeEndpoint()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'Google login successful',
    type: LoginResponseDto,
  })
  async googleAuthRedirect(@Req() req: any): Promise<LoginResponseDto> {
    return await this.authService.googleLogin(req.user);
  }
}
