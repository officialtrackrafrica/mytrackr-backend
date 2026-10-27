import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransactionReauthorizationAccountDto {
  @ApiProperty({ example: '65c4c03aa66a95b572cb5a86' })
  accountId: string;

  @ApiProperty({
    type: String, nullable: true, example: 'https://link.mono.co/example',
    description: 'Navigate the browser to this URL to reconnect the account. If null, retry the history request to generate a link.',
  })
  reauthorizationUrl: string | null;
}

export class TransactionSyncResponseDto {
  @ApiProperty({
    enum: ['completed', 'processing', 'reauthorization_required', 'failed'],
    example: 'reauthorization_required',
  })
  status: 'completed' | 'processing' | 'reauthorization_required' | 'failed';

  @ApiPropertyOptional({ example: 'Reconnect your bank to refresh transactions. Showing saved transactions.' })
  message?: string;

  @ApiPropertyOptional({ example: true })
  requiresReauthorization?: boolean;

  @ApiPropertyOptional({ type: [TransactionReauthorizationAccountDto] })
  accounts?: TransactionReauthorizationAccountDto[];
}
