import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsUUID,
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

  @ApiProperty({
    description: 'Asset category UUID from GET /finance/assets/categories',
    example: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1006',
  })
  @IsUUID()
  categoryId: string;

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

  @ApiPropertyOptional({
    description: 'Asset category UUID from GET /finance/assets/categories',
    example: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1006',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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

  @ApiProperty({
    description: 'Liability type UUID from GET /finance/liabilities/types',
    example: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2001',
  })
  @IsUUID()
  liabilityTypeId: string;

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

  @ApiPropertyOptional({
    description: 'Liability type UUID from GET /finance/liabilities/types',
    example: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2001',
  })
  @IsOptional()
  @IsUUID()
  liabilityTypeId?: string;

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

  @ApiPropertyOptional({
    description:
      'Category UUID from GET /finance/categories (e.g. the ID for "Expenses")',
    example: '71cc0462-9eef-471f-b8dd-61df76f281a2',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Sub-category UUID from GET /finance/categories (e.g. the ID for "Rent")',
    example: 'a2b3c4d5-e6f7-8901-abcd-ef0123456789',
  })
  @IsOptional()
  @IsUUID()
  subCategoryId?: string;

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

export class UpdateTransactionDto {
  @ApiPropertyOptional({
    description: 'Category UUID from GET /finance/categories',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Sub-category UUID from GET /finance/categories',
  })
  @IsOptional()
  @IsUUID()
  subCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
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

export class AssetQueryDto {
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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeArchived?: boolean;
}

export class LiabilityQueryDto {
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

  @ApiPropertyOptional({ example: 'ACTIVE', enum: LiabilityStatus })
  @IsOptional()
  @IsEnum(LiabilityStatus)
  status?: LiabilityStatus;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class AssetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({
    description: 'Asset category UUID from GET /finance/assets/categories',
    example: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1006',
  })
  categoryId: string;
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

export class AssetCategoryOptionDto {
  @ApiProperty({ example: '0d8a9f1d-5c6d-4c22-9e5b-9b6b5d5f1001' })
  id: string;

  @ApiProperty({
    example: 'Cash in Bank Account',
    description: 'Exact value to pass as category when creating or updating an asset',
  })
  value: AssetCategory;

  @ApiProperty({
    example: 'Cash in Bank Account',
    description: 'Human-readable label for display',
  })
  label: string;
}

export class LiabilityResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({
    description: 'Liability type UUID from GET /finance/liabilities/types',
    example: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2001',
  })
  liabilityTypeId: string;
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

export class LiabilityTypeOptionDto {
  @ApiProperty({ example: '1e9b7a2c-6f3d-4d11-8c7a-2f4d8c9a2001' })
  id: string;

  @ApiProperty({
    example: 'Business Loan',
    description:
      'Exact liability type value stored by the backend after resolving the UUID',
  })
  value: LiabilityType;

  @ApiProperty({
    example: 'Business Loan',
    description: 'Human-readable label for display',
  })
  label: string;
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
  @ApiPropertyOptional({
    description:
      'Original source transaction ID for mirrored linked-account transactions',
  })
  sourceTransactionId?: string;
  @ApiPropertyOptional({
    description:
      'Provider/source type for mirrored linked-account transactions',
    example: 'mono',
  })
  sourceProvider?: string;
  @ApiPropertyOptional({
    description: 'External sync identifier used to mirror provider transactions',
  })
  externalId?: string;
  @ApiProperty() date: Date;
  @ApiPropertyOptional() name?: string;
  @ApiProperty() amount: number;
  @ApiProperty({ enum: TransactionDirection }) direction: TransactionDirection;
  @ApiProperty() description: string;
  @ApiPropertyOptional({ enum: TransactionCategory })
  category?: TransactionCategory;
  @ApiPropertyOptional() subCategory?: string;
  @ApiPropertyOptional({ description: 'Category UUID' }) categoryId?: string;
  @ApiPropertyOptional({ description: 'Sub-category UUID' })
  subCategoryId?: string;
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

  @ApiProperty({
    example: {
      totalTransactions: 42,
      totalCategorized: 30,
      totalUncategorized: 12,
    },
  })
  summary: {
    totalTransactions: number;
    totalCategorized: number;
    totalUncategorized: number;
  };

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class PaginatedAssetResponseDto {
  @ApiProperty({ type: [AssetResponseDto] })
  data: AssetResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class PaginatedLiabilityResponseDto {
  @ApiProperty({ type: [LiabilityResponseDto] })
  data: LiabilityResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class TransactionSummaryResponseDto {
  @ApiProperty({
    example: 42,
    description: 'Total number of transactions matching the current filters',
  })
  totalTransactions: number;

  @ApiProperty({
    example: 30,
    description:
      'Total number of categorized transactions matching the current filters',
  })
  totalCategorized: number;

  @ApiProperty({
    example: 12,
    description:
      'Total number of uncategorized transactions matching the current filters',
  })
  totalUncategorized: number;
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
