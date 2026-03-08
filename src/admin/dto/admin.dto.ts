import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── User Administration DTOs ────────────────────────────────

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ['active', 'inactive', 'suspended'],
    description: 'New user status',
  })
  @IsEnum(['active', 'inactive', 'suspended'])
  status: 'active' | 'inactive' | 'suspended';
}

export class AdminQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'suspended'],
    description: 'Filter by status',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by role name' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ─── Dashboard DTOs ──────────────────────────────────────────

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: ['day', 'week', 'month'],
    default: 'month',
    description: 'Time period grouping',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  period?: 'day' | 'week' | 'month' = 'month';
}

// ─── Financial DTOs ──────────────────────────────────────────

export class TransactionQueryDto {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  start?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  end?: string;

  @ApiPropertyOptional({
    enum: ['credit', 'debit'],
    description: 'Transaction type',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Transaction category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ─── Audit Log DTOs ──────────────────────────────────────────

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by action type' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ─── System Settings DTOs ────────────────────────────────────

export class UpdateSettingDto {
  @ApiProperty({ description: 'Setting value (any JSON-compatible type)' })
  value: any;
}

export class ToggleFeatureFlagDto {
  @ApiProperty({ description: 'Whether the feature is enabled' })
  @IsBoolean()
  enabled: boolean;
}

// ─── Notification DTOs ───────────────────────────────────────

export class BroadcastNotificationDto {
  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification message body' })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    enum: ['email', 'push', 'sms'],
    default: 'email',
  })
  @IsOptional()
  @IsString()
  channel?: string = 'email';

  @ApiPropertyOptional({
    description: 'Filter criteria for target users',
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;
}

export class CreateNotificationTemplateDto {
  @ApiProperty({ description: 'Template name (unique)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email/notification subject' })
  @IsString()
  subject: string;

  @ApiProperty({ description: 'Template body with variables' })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    enum: ['email', 'push', 'sms'],
    default: 'email',
  })
  @IsOptional()
  @IsString()
  channel?: string = 'email';

  @ApiPropertyOptional({
    description: 'Template variables',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  variables?: string[];
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ enum: ['email', 'push', 'sms'] })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  variables?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Support & Dispute DTOs ──────────────────────────────────

export class UpdateTicketDto {
  @ApiPropertyOptional({
    enum: ['open', 'in_progress', 'resolved', 'closed'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Assign to admin user ID' })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Resolution notes' })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @IsOptional()
  @IsString()
  priority?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Resolution description' })
  @IsString()
  resolution: string;

  @ApiProperty({
    enum: ['resolved', 'rejected'],
    description: 'Dispute resolution status',
  })
  @IsEnum(['resolved', 'rejected'])
  status: 'resolved' | 'rejected';
}

export class TicketQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'in_progress', 'resolved', 'closed'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class DisputeQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'investigating', 'resolved', 'rejected'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ─── Webhook DTOs ────────────────────────────────────────────

export class WebhookQueryDto {
  @ApiPropertyOptional({ description: 'Filter by source (e.g. mono)' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Filter by event type' })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
