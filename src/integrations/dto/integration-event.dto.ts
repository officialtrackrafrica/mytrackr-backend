import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IntegrationEventType } from '../entities/integration-event.entity';

export class IntegrationEventCustomerDto {
  @ApiPropertyOptional({ example: 'customer@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Ada Customer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class IntegrationEventItemDto {
  @ApiPropertyOptional({ example: 'sku_123' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productId?: string;

  @ApiProperty({ example: 'Product A' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Clothing' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 12500 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;
}

export class CreateIntegrationEventDto {
  @ApiProperty({ enum: IntegrationEventType, example: 'order.paid' })
  @IsEnum(IntegrationEventType)
  event: IntegrationEventType;

  @ApiProperty({ example: 'woo_order_12345' })
  @IsString()
  @MaxLength(160)
  externalId: string;

  @ApiPropertyOptional({ example: 'order_12345' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  orderId?: string;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 'NGN', default: 'NGN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ example: 1875 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional({ example: 375 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentFee?: number;

  @ApiPropertyOptional({ example: 'paystack' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentProvider?: string;

  @ApiProperty({ example: '2026-04-27T10:30:00Z' })
  @IsDateString()
  occurredAt: string;

  @ApiPropertyOptional({ type: IntegrationEventCustomerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntegrationEventCustomerDto)
  customer?: IntegrationEventCustomerDto;

  @ApiPropertyOptional({ type: [IntegrationEventItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IntegrationEventItemDto)
  items?: IntegrationEventItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class IntegrationMetricsQueryDto {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class IntegrationEventIngestResponseDto {
  @ApiProperty({ example: '8b8109a2-2712-4f5d-9a78-cfbb97212d75' })
  id: string;

  @ApiProperty({ example: 'woo_order_12345' })
  externalId: string;

  @ApiProperty({ example: false })
  duplicate: boolean;
}

export class RevenuePeriodMetricDto {
  @ApiProperty({ example: '2026-04-27' })
  period: string;

  @ApiProperty({ example: 25000 })
  revenue: number;

  @ApiProperty({ example: 3 })
  orders: number;
}

export class RevenueProductMetricDto {
  @ApiPropertyOptional({ example: 'sku_123' })
  productId?: string;

  @ApiProperty({ example: 'Product A' })
  name: string;

  @ApiProperty({ example: 25000 })
  revenue: number;

  @ApiProperty({ example: 2 })
  quantity: number;
}

export class RevenueCategoryMetricDto {
  @ApiProperty({ example: 'Clothing' })
  category: string;

  @ApiProperty({ example: 25000 })
  revenue: number;

  @ApiProperty({ example: 2 })
  quantity: number;
}

export class FailedPaymentMetricDto {
  @ApiProperty({ example: 2 })
  count: number;

  @ApiProperty({ example: 15000 })
  amount: number;
}

export class IntegrationMetricsResponseDto {
  @ApiProperty({
    example: {
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-04-30T00:00:00.000Z',
    },
  })
  period: { start: Date; end: Date };

  @ApiProperty({ example: 250000 })
  grossSales: number;

  @ApiProperty({ example: 250000 })
  successfulPaymentInflow: number;

  @ApiProperty({ example: 10000 })
  refunds: number;

  @ApiProperty({ example: 236250 })
  netSales: number;

  @ApiProperty({ example: 10 })
  orderCount: number;

  @ApiProperty({ example: 25000 })
  averageOrderValue: number;

  @ApiProperty({ type: [RevenuePeriodMetricDto] })
  revenueByDay: RevenuePeriodMetricDto[];

  @ApiProperty({ type: [RevenuePeriodMetricDto] })
  revenueByWeek: RevenuePeriodMetricDto[];

  @ApiProperty({ type: [RevenuePeriodMetricDto] })
  revenueByMonth: RevenuePeriodMetricDto[];

  @ApiProperty({ type: [RevenueProductMetricDto] })
  revenueByProduct: RevenueProductMetricDto[];

  @ApiProperty({ type: [RevenueCategoryMetricDto] })
  revenueByCategory: RevenueCategoryMetricDto[];

  @ApiProperty({ example: 8 })
  customerCount: number;

  @ApiProperty({ example: 2 })
  repeatCustomerCount: number;

  @ApiProperty({ type: FailedPaymentMetricDto })
  failedPayments: FailedPaymentMetricDto;

  @ApiProperty({ example: 18750 })
  taxableSales: number;

  @ApiProperty({ example: 3750 })
  paymentFees: number;
}
