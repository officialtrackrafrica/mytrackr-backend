import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeSubscriptionDto {
  @ApiPropertyOptional({
    description: 'The preferred billing interval',
    enum: ['monthly', 'annually'],
    default: 'monthly',
  })
  @IsOptional()
  interval?: 'monthly' | 'annually' = 'monthly';
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
  @ApiProperty() reference: string;
}

export class AdditionalBankAccountFeeStatusDto {
  @ApiProperty({ example: 2500 })
  price: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 1 })
  freeIncludedAccounts: number;

  @ApiProperty({ example: 2 })
  linkedAccounts: number;

  @ApiProperty({ example: 1 })
  paidSlots: number;

  @ApiProperty({ example: 0 })
  availableSlots: number;

  @ApiProperty({ example: true })
  paymentRequiredForNextAccount: boolean;
}

export class BillingHistoryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 3095 })
  amount: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 'paystack' })
  gateway: string;

  @ApiProperty({ example: 'sub_ab12cd34' })
  reference: string;

  @ApiProperty({ required: false, example: '1234567890' })
  gatewayReference?: string;

  @ApiProperty({ example: 'success' })
  status: string;

  @ApiProperty({ required: false, example: 'card' })
  paymentMethod?: string;

  @ApiProperty({ example: 'subscription_initialization' })
  type: string;

  @ApiProperty({ example: 'Premium Subscription' })
  description: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaystackAuthorizationDto {
  @ApiProperty()
  authorization_code: string;

  @ApiPropertyOptional()
  bin?: string;

  @ApiPropertyOptional()
  last4?: string;

  @ApiPropertyOptional()
  exp_month?: string;

  @ApiPropertyOptional()
  exp_year?: string;

  @ApiPropertyOptional()
  channel?: string;

  @ApiPropertyOptional()
  card_type?: string;

  @ApiPropertyOptional()
  bank?: string;

  @ApiPropertyOptional()
  brand?: string;

  @ApiPropertyOptional()
  reusable?: boolean;

  @ApiPropertyOptional()
  country_code?: string;

  @ApiPropertyOptional()
  signature?: string;

  @ApiPropertyOptional()
  account_name?: string;
}

export class StoreBillingCardDto {
  @ApiProperty({ type: PaystackAuthorizationDto })
  authorization: PaystackAuthorizationDto;

  @ApiPropertyOptional()
  customerCode?: string;
}

export class BillingCardMetadataDto {
  @ApiProperty({ example: true })
  hasBillingCard: boolean;

  @ApiPropertyOptional({ example: 'paystack_cus_xxx' })
  customerCode?: string;

  @ApiPropertyOptional({ example: 'visa' })
  brand?: string;

  @ApiPropertyOptional({ example: '4242' })
  last4?: string;

  @ApiPropertyOptional({ example: '08' })
  expMonth?: string;

  @ApiPropertyOptional({ example: '2030' })
  expYear?: string;

  @ApiPropertyOptional({ example: 'card' })
  channel?: string;

  @ApiPropertyOptional({ example: 'VISA' })
  cardType?: string;

  @ApiPropertyOptional({ example: 'GTBank' })
  bank?: string;

  @ApiPropertyOptional({ example: true })
  reusable?: boolean;

  @ApiPropertyOptional()
  subscriptionStatus?: string;
}
