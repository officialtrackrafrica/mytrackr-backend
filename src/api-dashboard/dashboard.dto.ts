import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsInt,
  Min,
  Max,
  IsUUID,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IntegrationPlatform } from '../integrations/entities/integration.entity';

export class DashboardFormDto {
  @IsString() @MaxLength(160) csrf: string;
}

export class DashboardLoginDto extends DashboardFormDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(256) password: string;
}

export class DashboardIntegrationDto extends DashboardFormDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsEnum(IntegrationPlatform) platform: IntegrationPlatform;
  @IsOptional() @IsString() @MaxLength(4096) allowedOrigins?: string;
  @IsOptional() @IsString() @MaxLength(2048) redirectUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) webhookUrl?: string;
}

export class DashboardSensitiveDto extends DashboardFormDto {
  @IsString() @MinLength(1) @MaxLength(256) password: string;
  @IsIn(['confirm']) confirmation: string;
}

export class DashboardCheckoutDto extends DashboardFormDto {
  @IsIn(['web', 'solo', 'duo', 'unlimited']) planSlug:
    | 'web'
    | 'solo'
    | 'duo'
    | 'unlimited';
}

export class DashboardVerifyPaymentDto extends DashboardFormDto {
  @IsString() @MaxLength(160) @Matches(/^[A-Za-z0-9_-]+$/) reference: string;
}

export class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000000)
  page?: number;
  @IsOptional() @IsUUID() integrationId?: string;
}
