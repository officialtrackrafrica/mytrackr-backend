import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TaxBracketDto {
  @ApiProperty() minIncome: number;
  @ApiPropertyOptional() maxIncome?: number;
  @ApiProperty() rate: number;
  @ApiProperty() fixedAmount: number;
}

export class TaxEstimateResponseDto {
  @ApiProperty({ description: 'The tax year for the estimate', example: 2024 })
  year: number;

  @ApiProperty({ description: 'Personal Income Tax estimate', example: 150000 })
  pitEstimate: number;

  @ApiProperty({ description: 'Company Income Tax estimate', example: 450000 })
  citEstimate: number;

  @ApiProperty({ description: 'Total Revenue for the year', example: 10000000 })
  totalRevenue: number;

  @ApiProperty({ description: 'Total Expenses for the year', example: 5000000 })
  totalExpenses: number;

  @ApiProperty({ description: 'Wait... this is the profit', example: 5000000 })
  netProfit: number;

  @ApiProperty({
    description: 'Whether this is a projection or based on actual data',
    example: true,
  })
  isProjection: boolean;
}
