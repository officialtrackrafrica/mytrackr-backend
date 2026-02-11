import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from '../services';
import {
  UnifiedLoginDto,
  RefreshDto,
  LoginResponseDto,
  RefreshResponseDto,
  VerifyMfaDto,
  RegisterDto,
  RegisterResponseDto,
  VerifyRegistrationDto,
} from '../dto';
import { RateLimitGuard, RateLimit } from '../../common/guards';
import { AuthError } from '../../common/errors';
import { SWAGGER_TAGS } from '../../common/docs';

@ApiTags(SWAGGER_TAGS[1].name)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60 * 60 * 1000, max: 5 }) // 5 per hour per IP
  @ApiOperation({ summary: 'Register new user (email/phone/google)' })
  @ApiResponse({
    status: 201,
    description: 'Registration initiated',
    type: RegisterResponseDto,
  })
  @ApiResponse({ status: 400, description: 'User already exists' })
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<RegisterResponseDto> {
    try {
      return await this.authService.register(registerDto);
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

  @Post('verify-registration')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Verify registration with OTP code' })
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

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  @ApiOperation({ summary: 'Unified login endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async login(@Body() loginDto: UnifiedLoginDto): Promise<LoginResponseDto> {
    try {
      return await this.authService.login(loginDto);
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
  @ApiOperation({ summary: 'Verify MFA token' })
  @ApiResponse({
    status: 200,
    description: 'MFA verification successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid MFA token' })
  verifyMfa(@Body() _verifyMfaDto: VerifyMfaDto): Promise<LoginResponseDto> {
    // MFA verification would be implemented here
    throw new HttpException(
      {
        error: 'NOT_IMPLEMENTED',
        message: 'MFA verification not yet implemented',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
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
}
