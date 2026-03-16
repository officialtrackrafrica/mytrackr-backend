import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Request DTOs ────────────────────────────────────────────────────────────

export class LinkBusinessDto {
  @ApiProperty({ description: 'Business UUID to link to', example: 'b1a2...' })
  @IsString()
  @IsNotEmpty()
  businessId: string;
}

export class WebhookPayloadDto {
  @ApiProperty() event: string;
  @ApiProperty() data: any;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class MonoLinkResponseDto {
  @ApiProperty() url: string;
  @ApiProperty() sessionId: string;
}

export class MonoAccountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() monoAccountId: string;
  @ApiProperty() name: string;
  @ApiProperty() currency: string;
  @ApiProperty() type: string;
  @ApiProperty() accountNumber: string;
  @ApiProperty() balance: number;
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
