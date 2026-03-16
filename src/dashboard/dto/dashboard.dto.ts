import { ApiProperty } from '@nestjs/swagger';

export class DashboardMetricsResponseDto {
  @ApiProperty({ description: 'Total revenue', example: 1500000 })
  revenue: number;

  @ApiProperty({ description: 'Total expenses', example: 800000 })
  expenses: number;

  @ApiProperty({ description: 'Net profit', example: 700000 })
  netProfit: number;

  @ApiProperty({
    description: 'Cash balance across accounts',
    example: 1200000,
  })
  @ApiProperty({
    description: 'Number of uncategorised transactions',
    example: 12,
  })
  uncategorisedCount: number;

  @ApiProperty({ description: 'Monthly burn rate', example: 250000 })
  burnRate: number;
}
