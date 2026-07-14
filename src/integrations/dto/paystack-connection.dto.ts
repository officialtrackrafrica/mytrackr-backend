import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectPaystackDto {
  @ApiProperty({
    description:
      'Merchant Paystack secret key. Stored encrypted and never returned.',
    example: 'sk_live_xxx',
  })
  @IsString()
  @MaxLength(300)
  secretKey: string;
}

export class SyncPaystackDto {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class PaystackConnectionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() businessId: string;
  @ApiProperty() keyPreview: string;
  @ApiPropertyOptional() businessName?: string;
  @ApiPropertyOptional() businessEmail?: string;
  @ApiPropertyOptional() country?: string;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional() lastSyncedAt?: Date | null;
  @ApiPropertyOptional() lastSuccessfulSyncAt?: Date | null;
  @ApiPropertyOptional() lastSyncError?: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaystackSyncResponseDto {
  @ApiProperty({ example: 25 })
  imported: number;

  @ApiProperty({ example: 3 })
  skipped: number;

  @ApiProperty({ example: 28 })
  fetched: number;

  @ApiProperty({ example: 26 })
  fetchedTransactions: number;

  @ApiProperty({ example: 2 })
  fetchedRefunds: number;

  @ApiProperty({ type: PaystackConnectionResponseDto })
  connection: PaystackConnectionResponseDto;
}
