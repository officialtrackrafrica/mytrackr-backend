import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IntegrationPlatform } from '../entities/integration.entity';

export class CreateIntegrationDto {
  @ApiProperty({ example: 'Main website' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    enum: IntegrationPlatform,
    example: IntegrationPlatform.REACT,
  })
  @IsEnum(IntegrationPlatform)
  platform: IntegrationPlatform;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://example.com', 'https://app.example.com'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_tld: false }, { each: true })
  allowedOrigins?: string[];

  @ApiPropertyOptional({ example: 'https://example.com/mytrackr/callback' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  redirectUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/wp-json/mytrackr/hook' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;
}

export class UpdateIntegrationDto {
  @ApiPropertyOptional({ example: 'Marketing website' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    enum: IntegrationPlatform,
    example: IntegrationPlatform.WORDPRESS,
  })
  @IsOptional()
  @IsEnum(IntegrationPlatform)
  platform?: IntegrationPlatform;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_tld: false }, { each: true })
  allowedOrigins?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  redirectUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IntegrationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: IntegrationPlatform }) platform: IntegrationPlatform;
  @ApiProperty() publicKey: string;
  @ApiProperty() apiKeyPrefix: string;
  @ApiPropertyOptional()
  plan?: {
    id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    interval: string;
    monthlyRequestLimit: number;
  };
  @ApiProperty() billingStatus: string;
  @ApiPropertyOptional() currentPeriodEnd?: Date | null;
  @ApiProperty({ type: [String] }) allowedOrigins: string[];
  @ApiPropertyOptional() redirectUrl?: string;
  @ApiPropertyOptional() webhookUrl?: string;
  @ApiProperty() connectUrl: string;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional() lastUsedAt?: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class IntegrationCheckoutResponseDto {
  @ApiProperty({ example: false })
  hasActiveSubscription: boolean;

  @ApiProperty({
    example:
      'A Web subscription is required for website integrations. Complete payment to activate access.',
  })
  message: string;

  @ApiPropertyOptional({ example: 'web' })
  targetPlanSlug?: string;

  @ApiPropertyOptional({
    example: {
      id: 'plan-uuid',
      name: 'Unlimited',
      slug: 'unlimited',
      price: 5500,
      currency: 'NGN',
      interval: 'monthly',
    },
  })
  plan?: {
    id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    interval: string;
  };

  @ApiProperty({
    example: 'https://checkout.paystack.com/xxx',
    nullable: true,
  })
  authorizationUrl: string | null;

  @ApiProperty({ example: 'sub_ab12cd34', nullable: true })
  reference: string | null;
}

export class IntegrationPlanResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() price: number;
  @ApiProperty() currency: string;
  @ApiProperty() interval: string;
  @ApiProperty() monthlyRequestLimit: number;
  @ApiProperty({ type: [String] }) features: string[];
  @ApiProperty() isActive: boolean;
}

export class CreatedIntegrationResponseDto extends IntegrationResponseDto {
  @ApiProperty({
    description:
      'Shown once. Store this securely on your server or WordPress settings page.',
  })
  apiKey: string;

  @ApiPropertyOptional({ type: IntegrationCheckoutResponseDto })
  checkout?: IntegrationCheckoutResponseDto;
}

export class PublicIntegrationConfigDto {
  @ApiProperty() publicKey: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: IntegrationPlatform }) platform: IntegrationPlatform;
  @ApiProperty() businessName: string;
  @ApiProperty() connectUrl: string;
  @ApiProperty({ type: [String] }) allowedOrigins: string[];
  @ApiProperty()
  features: {
    pricing: boolean;
    accountLinking: boolean;
    ocrUpload: boolean;
  };

  @ApiProperty({ example: 'active' })
  billingStatus: string;
}

export class IntegrationMessageResponseDto {
  @ApiProperty({ example: 'Integration revoked' })
  message: string;
}
