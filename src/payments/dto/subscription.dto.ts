import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeSubscriptionDto {
  @ApiProperty({ description: 'The ID of the plan to subscribe to' })
  @IsString()
  @IsNotEmpty()
  planId: string;
}

export class UpdatePlanPriceDto {
  @ApiProperty({ description: 'The new price for the plan', example: 5000 })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}

export class PlanResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() price: number;
  @ApiPropertyOptional() currency?: string;
  @ApiProperty() interval: string;
  @ApiPropertyOptional() features?: string[];
  @ApiProperty() isActive: boolean;
}

export class SubscriptionStatusResponseDto {
  @ApiProperty() status: string;
  @ApiPropertyOptional() planName?: string;
  @ApiPropertyOptional() expiresAt?: Date;
  @ApiProperty() isTrial: boolean;
  @ApiPropertyOptional() trialEndsAt?: Date;
}

export class SubscriptionInitResponseDto {
  @ApiProperty() authorizationUrl: string;
  @ApiProperty() accessCode: string;
  @ApiProperty() reference: string;
}
