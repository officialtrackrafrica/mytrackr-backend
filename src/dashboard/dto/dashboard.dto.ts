import { ApiProperty } from '@nestjs/swagger';

export class DashboardMetricsDto {
  @ApiProperty({ description: 'Total revenue', example: 1500000 })
  revenue: number;

  @ApiProperty({ description: 'Total expenses', example: 800000 })
  expenses: number;

  @ApiProperty({ description: 'Net profit', example: 700000 })
  netProfit: number;

  @ApiProperty({ description: 'Cash balance across accounts', example: 1200000 })
  cashBalance: number;

  @ApiProperty({
    description: 'Number of uncategorised transactions',
    example: 12,
  })
  uncategorisedCount: number;

  @ApiProperty({ description: 'Monthly burn rate', example: 250000 })
  burnRate: number;
}

export class BusinessMetricsDto {
  @ApiProperty({ description: 'Business ID', example: 'uuid' })
  businessId: string;

  @ApiProperty({ description: 'Business Name', example: 'My Shop' })
  businessName: string;

  @ApiProperty({ description: 'Metrics for this business' })
  metrics: DashboardMetricsDto;
}

export class FullDashboardResponseDto {
  @ApiProperty({ description: 'Global metrics for all data' })
  global: DashboardMetricsDto;

  @ApiProperty({
    description: 'Metrics broken down by business',
    type: [BusinessMetricsDto],
  })
  businesses: BusinessMetricsDto[];

  @ApiProperty({
    description: 'Metrics for transactions not linked to any business',
  })
  unassigned: DashboardMetricsDto;
}

// Keep the old name for backward compatibility if needed, or redirect it
export class DashboardMetricsResponseDto extends FullDashboardResponseDto {}
