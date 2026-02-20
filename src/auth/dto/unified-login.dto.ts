import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsObject,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class DeviceInfoDto {
  @ApiProperty({
    description: 'Device ID',
    example: 'device-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({
    description: 'Device Type',
    example: 'mobile',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiProperty({
    description: 'User Agent',
    example: 'Mozilla/5.0...',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({
    description: 'IP Address',
    example: '127.0.0.1',
    required: false,
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class UnifiedLoginDto {
  @ApiProperty({
    enum: ['email', 'phone'],
    description: 'Login method',
    example: 'email',
  })
  @IsEnum(['email', 'phone'])
  method: 'email' | 'phone';

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
    description: 'Password (required for email/phone login)',
    example: 'Password123!',
    required: false,
  })
  @ValidateIf((o) => o.method === 'email' || o.method === 'phone')
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ type: DeviceInfoDto, required: false })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
