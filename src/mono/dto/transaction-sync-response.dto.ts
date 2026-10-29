import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransactionReauthorizationAccountDto {
  @ApiProperty({ example: '65c4c03aa66a95b572cb5a86' })
  accountId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://link.mono.co/example',
    description:
      'Navigate the browser to this URL to reconnect the account. If null, retry the history request to generate a link.',
  })
  reauthorizationUrl: string | null;
}

export class AccountTransactionCooldownDto {
  @ApiProperty({ description: 'Mono account ID' })
  accountId: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSyncedAt: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Last successful bank sync plus one hour. Null when the account has never synced.',
  })
  nextRefreshAt: string | null;

  @ApiProperty({ minimum: 0, example: 3500 })
  remainingSeconds: number;

  @ApiProperty({
    description: 'True while this account is within its bank refresh cooldown.',
  })
  isActive: boolean;
}

export class TransactionSyncCooldownDto {
  @ApiProperty({
    example: 3600,
    description:
      'Normal bank refresh cooldown in seconds. Forced refreshes and missing older history can bypass it.',
  })
  durationSeconds: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'Server time when the countdown was calculated; use to compensate for client clock differences.',
  })
  serverTime: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Earliest normal refresh time across linked accounts. Null with no accounts or an account that has never synced. This is eligibility, not a scheduled job.',
  })
  nextRefreshAt: string | null;

  @ApiProperty({
    minimum: 0,
    example: 3500,
    description:
      'Seconds until the earliest account cooldown expires. Zero means at least one account has no cooldown, or no accounts are linked.',
  })
  remainingSeconds: number;

  @ApiProperty({
    description:
      'True only when all linked accounts are cooling down. Always handle sync.status separately for processing, failures and reconnection.',
  })
  isActive: boolean;

  @ApiProperty({ type: [AccountTransactionCooldownDto] })
  accounts: AccountTransactionCooldownDto[];
}

export class TransactionSyncResponseDto {
  @ApiProperty({
    enum: ['completed', 'processing', 'reauthorization_required', 'failed'],
    example: 'reauthorization_required',
  })
  status: 'completed' | 'processing' | 'reauthorization_required' | 'failed';

  @ApiProperty({ type: TransactionSyncCooldownDto })
  cooldown: TransactionSyncCooldownDto;

  @ApiPropertyOptional({
    example:
      'Reconnect your bank to refresh transactions. Showing saved transactions.',
  })
  message?: string;

  @ApiPropertyOptional({ example: true })
  requiresReauthorization?: boolean;

  @ApiPropertyOptional({ type: [TransactionReauthorizationAccountDto] })
  accounts?: TransactionReauthorizationAccountDto[];
}
