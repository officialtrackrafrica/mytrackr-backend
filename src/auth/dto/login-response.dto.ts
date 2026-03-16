import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ description: 'User ID', example: 'user-123' })
  id: string;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'First name', example: 'John', required: false })
  firstName?: string;

  @ApiProperty({ description: 'Last name', example: 'Doe', required: false })
  lastName?: string;

  @ApiProperty({
    description: 'Profile picture URL',
    example: 'https://image.com/photo.jpg',
    required: false,
  })
  profilePicture?: string;

  @ApiProperty({ description: 'Is email verified', example: true })
  isVerified: boolean;

  @ApiProperty({ description: 'Account creation date' })
  createdAt: Date;
}

/**
 * Internal shape returned by AuthService login methods.
 * The controller reads accessToken/refreshToken to set httpOnly cookies
 * and strips them from the response body before sending to the client.
 */
export class LoginResponseDto {
  @ApiProperty({ description: 'Requires MFA verification', example: false })
  requiresMFA: boolean;

  @ApiProperty({
    description: 'MFA session ID (if MFA required)',
    example: 'mfa-123',
    required: false,
  })
  mfaSessionId?: string;

  /** Internal — set as httpOnly cookie by controller, never sent in body */
  accessToken?: string;

  /** Internal — set as httpOnly cookie by controller, never sent in body */
  refreshToken?: string;

  @ApiProperty({ type: UserResponseDto, required: false })
  user?: UserResponseDto;

  @ApiProperty({
    description: 'Token expiration in seconds',
    example: 900,
    required: false,
  })
  expiresIn?: number;
}

/**
 * Internal shape returned by AuthService.refreshToken.
 * The controller sets cookies and only sends `expiresIn` to the client.
 */
export class RefreshResponseDto {
  /** Internal — set as httpOnly cookie by controller, never sent in body */
  accessToken?: string;

  /** Internal — set as httpOnly cookie by controller, never sent in body */
  refreshToken?: string;

  @ApiProperty({
    description: 'Token expiration in seconds',
    example: 900,
  })
  expiresIn: number;
}

export class MfaVerificationResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ description: 'Token expiration in seconds', example: 900 })
  expiresIn: number;
}
