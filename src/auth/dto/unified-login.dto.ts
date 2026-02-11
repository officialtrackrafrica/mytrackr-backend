import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
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
}

export class UnifiedLoginDto {
  @ApiProperty({
    enum: ['email', 'phone', 'google'],
    description: 'Login method',
    example: 'email',
  })
  @IsEnum(['email', 'phone', 'google'])
  method: 'email' | 'phone' | 'google';

  @ApiProperty({
    description: 'Identifier (email or phone)',
    example: 'user@example.com',
  })
  @IsString()
  identifier: string;

  @ApiProperty({
    description: 'Credential (password or Google ID token)',
    example: 'Password123!',
  })
  @IsString()
  credential: string;

  @ApiProperty({ type: DeviceInfoDto, required: false })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
