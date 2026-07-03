import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminMessagingService } from '../services';
import { AdminAuditService } from '../services/admin-audit.service';
import {
  AdminMessageQueryDto,
  AdminMessageTemplateQueryDto,
  ComposeAdminMessageDto,
  CreateAdminMessageTemplateDto,
  SaveAdminMessageDraftDto,
  UpdateAdminMessageTemplateDto,
} from '../dto';

@ApiTags('Admin - Emails & Notifications')
@ApiCookieAuth('accessToken')
@Controller('admin/messages')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminMessagingController {
  constructor(
    private readonly messagingService: AdminMessagingService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List admin emails, push notifications, drafts, or trash' })
  @ApiResponse({ status: 200, description: 'Paginated message list' })
  async listMessages(@Query() query: AdminMessageQueryDto) {
    return this.messagingService.listMessages(query);
  }

  @Post('compose')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'Compose and send an admin email or push notification',
  })
  @ApiBody({ type: ComposeAdminMessageDto })
  @ApiResponse({ status: 201, description: 'Message sent and optionally saved as template' })
  async compose(@Body() dto: ComposeAdminMessageDto, @Req() req: any) {
    const result = await this.messagingService.composeMessage(
      req.user.id,
      dto,
    );
    await this.auditService.log(
      'ADMIN_MESSAGE_SENT',
      'AdminMessage',
      result.message.id,
      req.user.id,
      { channel: dto.channel || 'email', subject: dto.subject },
      req.ip,
    );
    return result;
  }

  @Post('drafts')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Save an admin email or push notification draft' })
  @ApiBody({ type: SaveAdminMessageDraftDto })
  @ApiResponse({ status: 201, description: 'Draft saved' })
  async saveDraft(@Body() dto: SaveAdminMessageDraftDto, @Req() req: any) {
    const result = await this.messagingService.saveDraft(req.user.id, dto);
    await this.auditService.log(
      'ADMIN_MESSAGE_DRAFT_SAVED',
      'AdminMessage',
      result.id,
      req.user.id,
      { channel: dto.channel || 'email', subject: dto.subject },
      req.ip,
    );
    return result;
  }

  @Patch('drafts/:id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update an admin message draft' })
  @ApiBody({ type: SaveAdminMessageDraftDto })
  @ApiResponse({ status: 200, description: 'Draft updated' })
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: SaveAdminMessageDraftDto,
    @Req() req: any,
  ) {
    const result = await this.messagingService.updateDraft(id, dto);
    await this.auditService.log(
      'ADMIN_MESSAGE_DRAFT_UPDATED',
      'AdminMessage',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Patch(':id/trash')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Move an admin message to trash' })
  @ApiResponse({ status: 200, description: 'Message moved to trash' })
  async moveToTrash(@Param('id') id: string, @Req() req: any) {
    const result = await this.messagingService.moveToTrash(id);
    await this.auditService.log(
      'ADMIN_MESSAGE_TRASHED',
      'AdminMessage',
      id,
      req.user.id,
      {},
      req.ip,
    );
    return result;
  }

  @Patch(':id/restore')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Restore an admin message from trash' })
  @ApiResponse({ status: 200, description: 'Message restored' })
  async restoreFromTrash(@Param('id') id: string, @Req() req: any) {
    return this.messagingService.restoreFromTrash(id);
  }

  @Get('templates')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List reusable email and push notification templates' })
  @ApiResponse({ status: 200, description: 'Paginated template list' })
  async listTemplates(@Query() query: AdminMessageTemplateQueryDto) {
    return this.messagingService.listTemplates(query);
  }

  @Post('templates')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Create a reusable email or push template' })
  @ApiBody({ type: CreateAdminMessageTemplateDto })
  @ApiResponse({ status: 201, description: 'Template created' })
  async createTemplate(
    @Body() dto: CreateAdminMessageTemplateDto,
    @Req() req: any,
  ) {
    return this.messagingService.createTemplate(req.user.id, dto);
  }

  @Patch('templates/:id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update a reusable email or push template' })
  @ApiBody({ type: UpdateAdminMessageTemplateDto })
  @ApiResponse({ status: 200, description: 'Template updated' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateAdminMessageTemplateDto,
  ) {
    return this.messagingService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Archive a reusable email or push template' })
  @ApiResponse({ status: 200, description: 'Template archived' })
  async deleteTemplate(@Param('id') id: string) {
    return this.messagingService.deleteTemplate(id);
  }
}
