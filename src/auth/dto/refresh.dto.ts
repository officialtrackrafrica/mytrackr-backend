import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token', example: 'def50200...' })
  @IsString()
  refreshToken: string;

  @ApiProperty({
    description: 'Device ID',
    example: 'device-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
