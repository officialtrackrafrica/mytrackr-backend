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
  CategorySource,
} from '../entities/transaction.entity';
import { AssetCategory } from '../entities/asset.entity';
import { LiabilityType, LiabilityStatus } from '../entities/liability.entity';
import { MatchType } from '../entities/categorization-rule.entity';
import { AccountCategoryType } from '../entities/account-category.entity';

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

  @ApiPropertyOptional({ example: 'Ayanfe Gbenga' })
  @IsString()
  name: string;

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

  @ApiPropertyOptional({ example: 'Cash sale — not deposited to bank' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Bank Account ID (omit for cash transactions)',
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string;
}

export class TransactionQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'Ayanfe' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isCategorised?: boolean;

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'date' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'date';

  @ApiPropertyOptional({ example: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class AssetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: AssetCategory }) category: AssetCategory;
  @ApiProperty() purchaseValue: number;
  @ApiProperty() currentValue: number;
  @ApiPropertyOptional() purchaseDate?: string;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() businessId: string;
  @ApiProperty() isArchived: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class LiabilityResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: LiabilityType }) liabilityType: LiabilityType;
  @ApiProperty() amountOwed: number;
  @ApiPropertyOptional() originalAmount?: number;
  @ApiPropertyOptional() dueDate?: string;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty({ enum: LiabilityStatus }) status: LiabilityStatus;
  @ApiProperty() businessId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CategorizationRuleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: MatchType }) matchType: MatchType;
  @ApiProperty() matchValue: string;
  @ApiProperty() category: string;
  @ApiProperty() subCategory: string;
  @ApiPropertyOptional() priority?: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() businessId: string;
  @ApiProperty() createdAt: Date;
}

export class RuleCreateResponseDto {
  @ApiProperty({ type: CategorizationRuleResponseDto })
  rule: CategorizationRuleResponseDto;

  @ApiProperty({
    description: 'Number of existing transactions retroactively categorised',
    example: 42,
  })
  retroactivelyApplied: number;
}

export class TransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() date: Date;
  @ApiPropertyOptional() name?: string;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: TransactionDirection }) direction: TransactionDirection;
  @ApiProperty() description: string;
  @ApiPropertyOptional({ enum: TransactionCategory })
  category?: TransactionCategory;
  @ApiPropertyOptional() subCategory?: string;
  @ApiPropertyOptional() monoCategory?: string;
  @ApiPropertyOptional() aiCategory?: string;
  @ApiPropertyOptional() manualCategory?: string;
  @ApiPropertyOptional() manualSubCategory?: string;
  @ApiPropertyOptional() ruleCategory?: string;
  @ApiPropertyOptional() ruleSubCategory?: string;
  @ApiPropertyOptional() heuristicCategory?: string;
  @ApiPropertyOptional({ enum: CategorySource })
  categorySource?: CategorySource;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() businessId: string;
  @ApiPropertyOptional() bankAccountId?: string;
  @ApiProperty() isCategorised: boolean;
  @ApiProperty() createdAt: Date;
}

export class PaginatedTransactionResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class ArchiveMessageResponseDto {
  @ApiProperty({ example: 'Asset archived' }) message: string;
}

export class CsvUploadResponseDto {
  @ApiProperty({ description: 'Number of transactions imported', example: 42 })
  imported: number;

  @ApiProperty({ description: 'Number of duplicate/skipped rows', example: 3 })
  skipped: number;

  @ApiProperty({
    description: 'First 10 row-level errors (if any)',
    type: [String],
    example: ['Row 5: Invalid date format: "abc"'],
  })
  errors: string[];
}

export class AccountSubCategoryResponseDto {
  @ApiProperty({ example: '71cc0462-9eef-471f-b8dd-61df76f281a2' })
  id: string;

  @ApiProperty({ example: 'Rent' })
  name: string;

  @ApiProperty({ example: true })
  isSystem: boolean;

  @ApiPropertyOptional()
  businessId?: string;
}

export class AccountCategoryResponseDto {
  @ApiProperty({ example: '71cc0462-9eef-471f-b8dd-61df76f281a2' })
  id: string;

  @ApiProperty({ example: 'Expenses' })
  name: string;

  @ApiProperty({ enum: AccountCategoryType })
  type: AccountCategoryType;

  @ApiProperty({ example: true })
  isSystem: boolean;

  @ApiPropertyOptional()
  businessId?: string;

  @ApiProperty({ type: [AccountSubCategoryResponseDto] })
  subCategories: AccountSubCategoryResponseDto[];
}
