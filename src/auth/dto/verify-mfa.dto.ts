import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaDto {
  @ApiProperty({ description: 'MFA session ID', example: 'mfa-123' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'MFA token/code', example: '123456' })
  @IsString()
  token: string;
}
