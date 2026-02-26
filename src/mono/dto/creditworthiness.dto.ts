import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ExistingLoanDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  tenor?: number;

  @ApiProperty({ description: 'Status of the loan', example: 'active' })
  @IsNotEmpty()
  @IsString()
  loan_status: string;

  @ApiPropertyOptional({ example: '2023-10-31' })
  @IsOptional()
  @IsString()
  date_opened?: string;

  @ApiPropertyOptional({ example: '2024-09-27' })
  @IsOptional()
  @IsString()
  closed_date?: string;

  @ApiPropertyOptional({ example: 'PROVIDUS BANK PLC' })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiPropertyOptional({ example: 'NGN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 65408100 })
  @IsOptional()
  @IsNumber()
  repayment_amount?: number;

  @ApiPropertyOptional({ example: 1200000000 })
  @IsOptional()
  @IsNumber()
  opening_balance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  repayment_schedule?: Record<string, string>[];
}

export class CreditworthinessDto {
  @ApiProperty({
    description: 'Bank Verification Number',
    example: '12345678901',
  })
  @IsNotEmpty()
  @IsString()
  bvn: string;

  @ApiProperty({
    description: 'Loan principal amount in kobo',
    example: 30000000,
  })
  @IsNotEmpty()
  @IsNumber()
  principal: number;

  @ApiProperty({ description: 'Interest rate percentage', example: 5 })
  @IsNotEmpty()
  @IsNumber()
  interest_rate: number;

  @ApiProperty({ description: 'Loan term in months', example: 12 })
  @IsNotEmpty()
  @IsNumber()
  term: number;

  @ApiProperty({
    description: 'Whether to run a credit bureau check',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  run_credit_check: boolean;

  @ApiPropertyOptional({
    description: 'Existing loans the customer already has',
    type: [ExistingLoanDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExistingLoanDto)
  existing_loans?: ExistingLoanDto[];
}
