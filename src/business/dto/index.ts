import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType } from '../entities/business.entity';

// ─── Request DTOs ────────────────────────────────────────────────────────────

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
    example: BusinessType.PRIVATE_LIMITED_COMPANY,
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

export class SelectBusinessTypeDto {
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
    description: 'Selected business type',
    enum: BusinessType,
    example: BusinessType.PRIVATE_LIMITED_COMPANY,
  })
  @IsEnum(BusinessType)
  @IsNotEmpty()
  businessType: BusinessType;
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
    example: BusinessType.SOLE_PROPRIETORSHIP,
    nullable: true,
  })
  businessType: BusinessType | null;

  @ApiProperty({ description: 'Currency code', example: 'NGN' })
  currency: string;

  @ApiProperty({ description: 'Owner user ID', example: 'u1a2b3c4-...' })
  userId: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last updated timestamp' })
  updatedAt: Date;
}

export class BusinessTypeOptionDto {
  @ApiProperty({
    description: 'Business type enum value',
    enum: BusinessType,
    example: BusinessType.SOLE_PROPRIETORSHIP,
  })
  value: BusinessType;

  @ApiProperty({
    description: 'Human-readable business type label',
    example: 'Sole Proprietorship',
  })
  label: string;
}

export class BusinessTypeSelectionStatusDto {
  @ApiProperty({
    description: 'Current business name',
    example: 'Acme Ventures Ltd',
  })
  name: string;

  @ApiProperty({
    description: 'Whether the user has selected a business type',
    example: false,
  })
  hasSelectedBusinessType: boolean;

  @ApiProperty({
    description: 'Selected business type',
    enum: BusinessType,
    nullable: true,
    required: false,
  })
  businessType: BusinessType | null;
}
