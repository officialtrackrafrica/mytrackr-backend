import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ description: 'User ID', example: 'user-123' })
  id: string;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  email: string;

  @ApiProperty({
    description: 'User phone',
    example: '+1234567890',
    required: false,
  })
  phone?: string;

  @ApiProperty({ description: 'First name', example: 'John', required: false })
  firstName?: string;

  @ApiProperty({ description: 'Last name', example: 'Doe', required: false })
  lastName?: string;

  @ApiProperty({ description: 'Is email/phone verified', example: true })
  isVerified: boolean;

  @ApiProperty({ description: 'Account creation date' })
  createdAt: Date;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'Requires MFA verification', example: false })
  requiresMFA: boolean;

  @ApiProperty({
    description: 'MFA session ID (if MFA required)',
    example: 'mfa-123',
    required: false,
  })
  mfaSessionId?: string;

  @ApiProperty({
    description: 'Access token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: false,
  })
  accessToken?: string;

  @ApiProperty({
    description: 'Refresh token',
    example: 'def50200...',
    required: false,
  })
  refreshToken?: string;

  @ApiProperty({ type: UserResponseDto, required: false })
  user?: UserResponseDto;

  @ApiProperty({
    description: 'Token expiration in seconds',
    example: 3600,
    required: false,
  })
  expiresIn?: number;
}

export class RefreshResponseDto {
  @ApiProperty({
    description: 'New access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({ description: 'New refresh token', example: 'def50200...' })
  refreshToken: string;

  @ApiProperty({ description: 'Token expiration in seconds', example: 3600 })
  expiresIn: number;
}

export class MfaVerificationResponseDto {
  @ApiProperty({
    description: 'Access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token', example: 'def50200...' })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ description: 'Token expiration in seconds', example: 3600 })
  expiresIn: number;
}
