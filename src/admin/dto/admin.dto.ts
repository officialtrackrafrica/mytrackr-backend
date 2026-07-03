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
  IsEmail,
  MinLength,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BusinessType } from '../../business/entities/business.entity';

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

  @ApiPropertyOptional({ description: 'Filter by business type' })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({ description: 'Filter by active subscription plan slug/name' })
  @IsOptional()
  @IsString()
  planType?: string;

  @ApiPropertyOptional({
    enum: ['connected', 'disconnected', 'not_connected'],
    description: 'Filter by bank connection status',
  })
  @IsOptional()
  @IsString()
  bankConnectionStatus?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'suspended', 'deleted'],
    description: 'Filter by account status',
  })
  @IsOptional()
  @IsString()
  accountStatus?: string;

  @ApiPropertyOptional({
    enum: ['name', 'createdAt', 'plan', 'banksLinked', 'lastActive', 'businessType', 'accountStatus'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC', 'asc', 'desc'], default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: string = 'DESC';

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

export class AdminUserSubscriptionHistoryQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'active', 'scheduled', 'past_due', 'canceled', 'cancelled', 'failed'],
    description: 'Filter subscription records by status',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD or ISO)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD or ISO)' })
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

export class AdminStatsQueryDto {
  @ApiPropertyOptional({
    description: 'Single date filter (YYYY-MM-DD). Applies to created/status dates where relevant.',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Start date for range filter (YYYY-MM-DD or ISO)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date for range filter (YYYY-MM-DD or ISO)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Alias for dateFrom' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Alias for dateTo' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

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

  @ApiPropertyOptional({ description: 'Filter by route/resource path' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Filter by HTTP method' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'Filter by HTTP status code' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  statusCode?: number;

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

export class UpdateSettingDto {
  @ApiProperty({ description: 'Setting value (any JSON-compatible type)' })
  value: any;
}

export class ToggleFeatureFlagDto {
  @ApiProperty({ description: 'Whether the feature is enabled' })
  @IsBoolean()
  enabled: boolean;
}

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

export class AdminMessageQueryDto {
  @ApiPropertyOptional({ enum: ['email', 'push'] })
  @IsOptional()
  @IsIn(['email', 'push'])
  channel?: 'email' | 'push';

  @ApiPropertyOptional({ enum: ['sent', 'draft', 'trash', 'failed'] })
  @IsOptional()
  @IsIn(['sent', 'draft', 'trash', 'failed'])
  status?: 'sent' | 'draft' | 'trash' | 'failed';

  @ApiPropertyOptional({ description: 'Search by subject, body, or recipient' })
  @IsOptional()
  @IsString()
  search?: string;

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

export class ComposeAdminMessageDto {
  @ApiPropertyOptional({ enum: ['email', 'push'], default: 'email' })
  @IsOptional()
  @IsIn(['email', 'push'])
  channel?: 'email' | 'push' = 'email';

  @ApiPropertyOptional({
    enum: ['all_users', 'active_users', 'inactive_users', 'subscribers', 'custom'],
    default: 'all_users',
  })
  @IsOptional()
  @IsString()
  recipientGroup?: string = 'all_users';

  @ApiPropertyOptional({
    type: [String],
    description: 'Explicit recipient emails/user IDs. Used with custom group or as an override.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiProperty({ description: 'Email subject or push title' })
  @IsString()
  subject: string;

  @ApiProperty({ description: 'Email body or push message body' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: 'Reusable template ID to prefill/send from' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Automatically save composed message as a reusable template',
  })
  @IsOptional()
  @IsBoolean()
  saveAsTemplate?: boolean = true;

  @ApiPropertyOptional({ description: 'Template name when auto-saving' })
  @IsOptional()
  @IsString()
  templateName?: string;

  @ApiPropertyOptional({ description: 'Additional metadata for UI/push providers' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class SaveAdminMessageDraftDto extends ComposeAdminMessageDto {}

export class AdminMessageTemplateQueryDto {
  @ApiPropertyOptional({ enum: ['email', 'push'] })
  @IsOptional()
  @IsIn(['email', 'push'])
  channel?: 'email' | 'push';

  @ApiPropertyOptional({ description: 'Search by template name, subject, or body' })
  @IsOptional()
  @IsString()
  search?: string;

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

export class CreateAdminMessageTemplateDto {
  @ApiPropertyOptional({ enum: ['email', 'push'], default: 'email' })
  @IsOptional()
  @IsIn(['email', 'push'])
  channel?: 'email' | 'push' = 'email';

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateAdminMessageTemplateDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class FaqQueryDto {
  @ApiPropertyOptional({ description: 'Search FAQ question or answer' })
  @IsOptional()
  @IsString()
  search?: string;

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

export class CreateFaqDto {
  @ApiProperty()
  @IsString()
  question: string;

  @ApiProperty()
  @IsString()
  answer: string;
}

export class UpdateFaqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  answer?: string;
}

export class CategorizationRuleQueryDto {
  @ApiPropertyOptional({ description: 'Search by category, sub-category, or keyword' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter active/inactive rules' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

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

export class CreateAdminCategorizationRuleDto {
  @ApiProperty({ description: 'Rule category label/type' })
  @IsString()
  category: string;

  @ApiPropertyOptional({
    description: 'Optional sub-category label. Defaults to category when omitted.',
  })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiProperty({
    type: [String],
    description: 'Keywords that should map to this category',
  })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number = 100;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateAdminCategorizationRuleDto {
  @ApiPropertyOptional({ description: 'Rule category label/type' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Optional sub-category label' })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Replacement keyword list',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SendUncategorizedTransactionReminderDto {
  @ApiPropertyOptional({
    description: 'When true, only returns the target users without sending emails',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

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

export class ReplySupportTicketDto {
  @ApiProperty({ description: 'Reply message body' })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    description: 'Optional ticket status update after replying',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class ReplySupportTicketUploadDto extends ReplySupportTicketDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional reply attachment file',
  })
  @IsOptional()
  attachment?: any;
}

export class CreateSupportTicketDto {
  @ApiProperty({ description: 'Support ticket title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Support ticket description' })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    default: 'request',
    description: 'Support ticket category/type',
  })
  @IsOptional()
  @IsString()
  category?: string = 'request';

  @ApiPropertyOptional({
    default: 'request',
    description: 'Alias for category for clients that submit ticket type',
  })
  @IsOptional()
  @IsString()
  type?: string;
}

export class CreateSupportTicketUploadDto extends CreateSupportTicketDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional ticket attachment file',
  })
  @IsOptional()
  attachment?: any;
}

export class UserSupportTicketQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'in_progress', 'resolved', 'closed'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by support ticket category/type',
  })
  @IsOptional()
  @IsString()
  category?: string;

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

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ description: 'User first name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'User last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Display username/full name' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'User email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Business name' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ enum: BusinessType, description: 'Business type' })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;
}

export class AdminResetUserPasswordDto {
  @ApiProperty({ description: 'New password to set for the user' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class AuditLogCleanupDto {
  @ApiPropertyOptional({
    description: 'Delete logs older than this many days',
    default: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  days?: number = 90;

  @ApiPropertyOptional({
    description: 'When true, only returns the number of logs that would be deleted',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

export class SupportTicketResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiPropertyOptional()
  attachmentUrl?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  priority: string;

  @ApiPropertyOptional()
  resolution?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
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

  @ApiPropertyOptional({
    description: 'Filter by support ticket category/type',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search by ticket title, description, category, user name, or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD or ISO)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD or ISO)' })
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
