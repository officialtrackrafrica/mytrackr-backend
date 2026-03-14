import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    enum: ['email', 'phone', 'google'],
    description: 'Registration method',
    example: 'email',
  })
  @IsEnum(['email', 'phone', 'google'])
  method: 'email' | 'phone' | 'google';

  @ApiProperty({
    description: 'Email address (required if method is email)',
    example: 'user@example.com',
    required: false,
  })
  @ValidateIf((o) => o.method === 'email')
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Phone number (required if method is phone)',
    example: '+1234567890',
    required: false,
  })
  @ValidateIf((o) => o.method === 'phone')
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Password (min 8 chars)',
    example: 'Password123!',
    required: false,
  })
  @ValidateIf((o) => o.method === 'email' || o.method === 'phone')
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({
    description: 'Google ID Token (required if method is google)',
    required: false,
  })
  @ValidateIf((o) => o.method === 'google')
  @IsString()
  googleIdToken?: string;

  @ApiProperty({ description: 'First Name', example: 'John', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ description: 'Last Name', example: 'Doe', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;
}

export class RegisterResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Registration successful' })
  message: string;

  @ApiProperty({ example: true })
  requiresVerification: boolean;

  @ApiProperty({ required: false })
  accessToken?: string;

  @ApiProperty({ required: false })
  refreshToken?: string;

  @ApiProperty({ required: false })
  expiresIn?: number;
}
