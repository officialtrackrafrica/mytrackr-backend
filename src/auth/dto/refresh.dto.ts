import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token', example: 'def50200...' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;

  @ApiProperty({
    description: 'Device ID',
    example: 'device-123',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviceId?: string;
}
