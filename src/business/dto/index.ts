import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType } from '../entities/business.entity';

// ─── Request DTOs ────────────────────────────────────────────────────────────

export class CreateBusinessDto {
  @ApiProperty({
    description: 'Business name',
    example: 'Acme Ventures Ltd',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Business type / industry focus',
    enum: BusinessType,
    example: BusinessType.SERVICE,
  })
  @IsEnum(BusinessType)
  businessType: BusinessType;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency code',
    example: 'NGN',
    default: 'NGN',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateBusinessDto {
  @ApiPropertyOptional({
    description: 'Updated business name',
    example: 'Acme Ventures International',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated business type',
    enum: BusinessType,
    example: BusinessType.PRODUCT,
  })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency code',
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class BusinessResponseDto {
  @ApiProperty({ description: 'Business UUID', example: 'b1a2c3d4-...' })
  id: string;

  @ApiProperty({ description: 'Business name', example: 'Acme Ventures Ltd' })
  name: string;

  @ApiProperty({
    description: 'Business type',
    enum: BusinessType,
    example: BusinessType.SERVICE,
  })
  businessType: BusinessType;

  @ApiProperty({ description: 'Currency code', example: 'NGN' })
  currency: string;

  @ApiProperty({ description: 'Owner user ID', example: 'u1a2b3c4-...' })
  userId: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last updated timestamp' })
  updatedAt: Date;
}
