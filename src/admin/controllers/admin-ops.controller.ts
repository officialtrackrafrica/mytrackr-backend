import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminSystemService } from '../services/admin-system.service';
import { AdminAuditService } from '../services/admin-audit.service';
import {
  AuditLogQueryDto,
  UpdateSettingDto,
  ToggleFeatureFlagDto,
  BroadcastNotificationDto,
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
  WebhookQueryDto,
} from '../dto';

@ApiTags('Admin - Operations')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminOpsController {
  constructor(
    private readonly systemService: AdminSystemService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get('audit-logs')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get audit trail with filters' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  async getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.auditService.getAuditLogs(query);
  }

  @Get('security/login-attempts')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get users with failed login attempts' })
  @ApiResponse({ status: 200, description: 'Failed login attempts' })
  async getFailedLoginAttempts() {
    return this.auditService.getFailedLoginAttempts();
  }

  @Get('security/suspicious-activity')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get suspicious activity alerts' })
  @ApiResponse({ status: 200, description: 'Suspicious activity report' })
  async getSuspiciousActivity() {
    return this.auditService.getSuspiciousActivity();
  }

  @Get('settings')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get all platform settings' })
  @ApiResponse({ status: 200, description: 'Platform settings' })
  async getSettings() {
    return this.systemService.getSettings();
  }

  @Patch('settings/:key')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update a platform setting' })
  @ApiResponse({ status: 200, description: 'Setting updated' })
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @Req() req: any,
  ) {
    const result = await this.systemService.updateSetting(
      key,
      dto.value,
      req.user.id,
    );
    await this.auditService.log(
      'SETTING_UPDATED',
      'SystemSetting',
      key,
      req.user.id,
      { key, value: dto.value },
      req.ip,
    );
    return result;
  }

  @Get('feature-flags')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get all feature flags' })
  @ApiResponse({ status: 200, description: 'Feature flags' })
  async getFeatureFlags() {
    return this.systemService.getFeatureFlags();
  }

  @Patch('feature-flags/:key')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Toggle a feature flag' })
  @ApiResponse({ status: 200, description: 'Feature flag toggled' })
  async toggleFeatureFlag(
    @Param('key') key: string,
    @Body() dto: ToggleFeatureFlagDto,
    @Req() req: any,
  ) {
    const result = await this.systemService.toggleFeatureFlag(
      key,
      dto.enabled,
      req.user.id,
    );
    await this.auditService.log(
      'FEATURE_FLAG_TOGGLED',
      'FeatureFlag',
      key,
      req.user.id,
      { key, enabled: dto.enabled },
      req.ip,
    );
    return result;
  }

  @Post('notifications/broadcast')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Broadcast a notification to users' })
  @ApiResponse({ status: 200, description: 'Notification queued' })
  async broadcastNotification(
    @Body() dto: BroadcastNotificationDto,
    @Req() req: any,
  ) {
    const result = await this.systemService.broadcastNotification(
      dto.title,
      dto.message,
      dto.channel || 'email',
      dto.filters,
    );
    await this.auditService.log(
      'NOTIFICATION_BROADCAST',
      'Notification',
      null,
      req.user.id,
      { title: dto.title, channel: dto.channel },
      req.ip,
    );
    return result;
  }

  @Get('notifications/templates')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List notification templates' })
  @ApiResponse({ status: 200, description: 'Notification templates' })
  async getTemplates() {
    return this.systemService.getNotificationTemplates();
  }

  @Post('notifications/templates')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create a notification template' })
  @ApiResponse({ status: 201, description: 'Template created' })
  async createTemplate(@Body() dto: CreateNotificationTemplateDto) {
    return this.systemService.createNotificationTemplate(dto);
  }

  @Patch('notifications/templates/:id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update a notification template' })
  @ApiResponse({ status: 200, description: 'Template updated' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    return this.systemService.updateNotificationTemplate(id, dto);
  }

  @Get('webhooks/logs')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get webhook delivery logs' })
  @ApiResponse({ status: 200, description: 'Paginated webhook logs' })
  async getWebhookLogs(@Query() query: WebhookQueryDto) {
    return this.systemService.getWebhookLogs(query);
  }

  @Get('webhooks/failed')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get failed webhook deliveries' })
  @ApiResponse({ status: 200, description: 'Failed webhooks' })
  async getFailedWebhooks() {
    return this.systemService.getFailedWebhooks();
  }

  @Post('webhooks/:id/retry')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  @ApiResponse({ status: 200, description: 'Webhook queued for retry' })
  @ApiResponse({ status: 404, description: 'Webhook log not found' })
  async retryWebhook(@Param('id') id: string, @Req() req: any) {
    const result = await this.systemService.retryWebhook(id);
    await this.auditService.log(
      'WEBHOOK_RETRIED',
      'WebhookLog',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }

  @Get('integrations/health')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Check health of third-party integrations' })
  @ApiResponse({ status: 200, description: 'Integration health status' })
  getIntegrationsHealth() {
    return this.systemService.getIntegrationsHealth();
  }

  @Get('health')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get system health status' })
  @ApiResponse({ status: 200, description: 'System health' })
  async getSystemHealth() {
    return this.systemService.getSystemHealth();
  }

  @Get('metrics')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get platform metrics' })
  @ApiResponse({ status: 200, description: 'Platform metrics' })
  async getMetrics() {
    return this.systemService.getMetrics();
  }

  @Get('jobs')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get background job statuses' })
  @ApiResponse({ status: 200, description: 'Job statuses' })
  async getJobs() {
    return this.systemService.getBackgroundJobs();
  }

  @Post('cache/clear')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Clear application cache' })
  @ApiResponse({ status: 200, description: 'Cache cleared' })
  async clearCache(@Req() req: any) {
    const result = await this.systemService.clearCache();
    await this.auditService.log(
      'CACHE_CLEARED',
      'System',
      null,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }
}
