import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeSubscriptionDto {
  @ApiProperty({ description: 'The ID of the plan to subscribe to' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({
    description: 'Payment gateway to use (defaults to paystack)',
    default: 'paystack',
  })
  @IsString()
  @IsOptional()
  gateway?: string;
}
