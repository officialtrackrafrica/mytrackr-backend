import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterWithGoogleDto {
  @ApiProperty({
    description: 'Google OAuth ID Token obtained from Google Sign-In',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.google_id_token_here',
  })
  @IsString()
  @IsNotEmpty()
  googleIdToken: string;

  @ApiPropertyOptional({
    description: 'First name',
    example: 'Ada',
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Lovelace',
  })
  @IsString()
  @IsOptional()
  lastName?: string;
}
