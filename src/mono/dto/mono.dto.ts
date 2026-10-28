import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Request DTOs ────────────────────────────────────────────────────────────

export class LinkBusinessDto {
  @ApiProperty({ description: 'Business UUID to link to', example: 'b1a2...' })
  @IsString()
  @IsNotEmpty()
  businessId: string;
}

export class WebhookPayloadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiProperty()
  @IsNotEmpty()
  data: any;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  event_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  timestamp?: any;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class MonoLinkResponseDto {
  @ApiProperty() url: string;
  @ApiProperty() sessionId: string;
}

export class MonoAccountResponseDto {
  @ApiProperty({
    description: 'True while bank data is loading or being copied into the dashboard. Poll GET /mono/accounts until false, then refresh dashboard and transaction history. False also for failed, disconnected, or reauthorization-required accounts; check their statuses.',
  })
  isLoading: boolean;
  @ApiProperty({ nullable: true }) syncStatus: string | null;
  @ApiProperty() requiresReauthorization: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Navigate to this Mono URL when requiresReauthorization is true' })
  reauthorizationUrl?: string | null;
  @ApiProperty() id: string;
  @ApiProperty() monoAccountId: string;
  @ApiProperty() name: string;
  @ApiProperty() currency: string;
  @ApiProperty() type: string;
  @ApiProperty() accountNumber: string;
  @ApiProperty({
    description: 'Account balance in major currency units, e.g. naira for NGN',
    example: 456110.51,
  })
  balance: number;
  @ApiProperty() bvn: string;
  @ApiProperty() institutionName: string;
  @ApiProperty() isSynced: boolean;
  @ApiPropertyOptional() businessId?: string;
}

export class MonoTransactionSummaryResponseDto {
  @ApiProperty() totalCredits: number;
  @ApiProperty() totalDebits: number;
  @ApiProperty() transactionCount: number;
}
