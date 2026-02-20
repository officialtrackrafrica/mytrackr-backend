import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of permission objects',
    example: [
      { action: 'read', subject: 'User' },
      { action: 'update', subject: 'User' },
    ],
  })
  @IsArray()
  @IsOptional()
  permissions?: Record<string, any>[];
}
