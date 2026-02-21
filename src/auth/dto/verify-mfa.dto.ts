import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaDto {
  @ApiProperty({ description: 'MFA session ID', example: 'mfa-123' })
  @IsString()
  @IsNotEmpty({ message: 'Session ID is required' })
  sessionId: string;

  @ApiProperty({ description: '6-digit MFA code', example: '123456' })
  @IsString()
  @IsNotEmpty({ message: 'MFA token is required' })
  @Length(6, 8, {
    message: 'Token must be 6 digits (or 8 characters for a backup code)',
  })
  token: string;
}
