import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateAccountDto {
  @ApiPropertyOptional({
    description: 'Scope for the request (e.g., auth or income)',
    example: 'auth',
  })
  @IsOptional()
  @IsString()
  scope?: string = 'auth';

  @ApiPropertyOptional({
    description: 'Redirect URL after authentication completes',
    example: 'https://mono.co',
  })
  @IsOptional()
  @IsString()
  redirect_url?: string;
}

export class ReauthAccountDto {
  @ApiProperty({
    description: 'Mono Account ID to re-authenticate',
    example: '65c4c03aa66a95b572cb5a86',
  })
  @IsNotEmpty()
  @IsString()
  accountId: string;

  @ApiPropertyOptional({
    description: 'Redirect URL after authentication completes',
    example: 'https://mono.co',
  })
  @IsOptional()
  @IsString()
  redirect_url?: string;
}
