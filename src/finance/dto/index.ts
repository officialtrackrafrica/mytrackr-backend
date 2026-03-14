import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionCategory,
  TransactionDirection,
} from '../entities/transaction.entity';
import { AssetCategory } from '../entities/asset.entity';
import { LiabilityType, LiabilityStatus } from '../entities/liability.entity';
import { MatchType } from '../entities/categorization-rule.entity';

export class CreateAssetDto {
  @ApiProperty({ example: 'MacBook Pro' })
  @IsString()
  name: string;

  @ApiProperty({ enum: AssetCategory })
  @IsEnum(AssetCategory)
  category: AssetCategory;

  @ApiProperty({ example: 1500000 })
  @IsNumber()
  @Type(() => Number)
  purchaseValue: number;

  @ApiProperty({ example: 1200000 })
  @IsNumber()
  @Type(() => Number)
  currentValue: number;

  @ApiPropertyOptional({ example: '2025-01-15' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional({ example: 'Company laptop' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Business ID' })
  @IsString()
  businessId: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional({ example: 'MacBook Pro M3' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: AssetCategory })
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @ApiPropertyOptional({ example: 1100000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  currentValue?: number;

  @ApiPropertyOptional({ example: 'Updated notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class CreateLiabilityDto {
  @ApiProperty({ example: 'Office Rent Loan' })
  @IsString()
  name: string;

  @ApiProperty({ enum: LiabilityType })
  @IsEnum(LiabilityType)
  liabilityType: LiabilityType;

  @ApiProperty({ example: 500000 })
  @IsNumber()
  @Type(() => Number)
  amountOwed: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  originalAmount?: number;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Monthly repayment' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Business ID' })
  @IsString()
  businessId: string;
}

export class UpdateLiabilityDto {
  @ApiPropertyOptional({ example: 'Updated Loan Name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 300000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amountOwed?: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Partially repaid' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: LiabilityStatus })
  @IsOptional()
  @IsEnum(LiabilityStatus)
  status?: LiabilityStatus;
}

export class CreateCategorizationRuleDto {
  @ApiProperty({ enum: MatchType })
  @IsEnum(MatchType)
  matchType: MatchType;

  @ApiProperty({ example: 'MTN' })
  @IsString()
  matchValue: string;

  @ApiProperty({ example: 'EXPENSE' })
  @IsString()
  category: string;

  @ApiProperty({ example: 'Telecom' })
  @IsString()
  subCategory: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @ApiProperty({ description: 'Business ID' })
  @IsString()
  businessId: string;
}

export class UpdateCategorizationRuleDto {
  @ApiPropertyOptional({ enum: MatchType })
  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @ApiPropertyOptional({ example: 'Airtel' })
  @IsOptional()
  @IsString()
  matchValue?: string;

  @ApiPropertyOptional({ example: 'EXPENSE' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Telecom' })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTransactionDto {
  @ApiProperty({ example: '2025-03-10' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Type(() => Number)
  amount: number;

  @ApiProperty({ enum: TransactionDirection })
  @IsEnum(TransactionDirection)
  direction: TransactionDirection;

  @ApiProperty({ example: 'Sale of goods to customer' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ enum: TransactionCategory })
  @IsOptional()
  @IsEnum(TransactionCategory)
  category?: TransactionCategory;

  @ApiPropertyOptional({ example: 'Product Sales' })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({ example: 'Cash sale' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Business ID' })
  @IsString()
  businessId: string;

  @ApiProperty({ description: 'Bank Account ID' })
  @IsString()
  bankAccountId: string;
}
