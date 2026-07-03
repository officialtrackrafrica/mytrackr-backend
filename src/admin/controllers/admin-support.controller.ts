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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminSystemService } from '../services/admin-system.service';
import { AdminAuditService } from '../services/admin-audit.service';
import {
  UpdateTicketDto,
  ReplySupportTicketDto,
  ReplySupportTicketUploadDto,
  ResolveDisputeDto,
  TicketQueryDto,
  DisputeQueryDto,
} from '../dto';

@ApiTags('Admin - Support & Disputes')
@ApiCookieAuth('accessToken')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminSupportController {
  constructor(
    private readonly systemService: AdminSystemService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get('support/tickets')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List support tickets' })
  @ApiResponse({ status: 200, description: 'Paginated support tickets' })
  async getTickets(@Query() query: TicketQueryDto) {
    return this.systemService.getTickets(query);
  }

  @Get('support/tickets/stats')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get support ticket status counts' })
  @ApiResponse({ status: 200, description: 'Support ticket stats' })
  async getTicketStats() {
    return this.systemService.getTicketStats();
  }

  @Get('support/tickets/:id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get support ticket details and replies' })
  @ApiResponse({ status: 200, description: 'Support ticket details' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicket(@Param('id') id: string) {
    return this.systemService.getAdminSupportTicket(id);
  }

  @Post('support/tickets/:id/replies')
  @UseInterceptors(FileInterceptor('attachment'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ReplySupportTicketUploadDto })
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Reply to a client support ticket' })
  @ApiResponse({ status: 201, description: 'Reply added' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async replyToTicket(
    @Param('id') id: string,
    @Body() dto: ReplySupportTicketDto,
    @UploadedFile() attachment: any,
    @Req() req: any,
  ) {
    const result = await this.systemService.replyToSupportTicket(
      id,
      req.user.id,
      dto,
      attachment,
    );
    await this.auditService.log(
      'TICKET_REPLIED',
      'SupportTicket',
      id,
      req.user.id,
      { status: dto.status },
      req.ip,
    );
    return result;
  }

  @Patch('support/tickets/:id')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update support ticket status' })
  @ApiResponse({ status: 200, description: 'Ticket updated' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async updateTicket(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @Req() req: any,
  ) {
    const result = await this.systemService.updateTicket(id, dto);
    await this.auditService.log(
      'TICKET_UPDATED',
      'SupportTicket',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }

  @Get('disputes')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List transaction disputes' })
  @ApiResponse({ status: 200, description: 'Paginated disputes' })
  async getDisputes(@Query() query: DisputeQueryDto) {
    return this.systemService.getDisputes(query);
  }

  @Patch('disputes/:id/resolve')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Resolve a transaction dispute' })
  @ApiResponse({ status: 200, description: 'Dispute resolved' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @Req() req: any,
  ) {
    const result = await this.systemService.resolveDispute(
      id,
      dto,
      req.user.id,
    );
    await this.auditService.log(
      'DISPUTE_RESOLVED',
      'Dispute',
      id,
      req.user.id,
      { resolution: dto.resolution, status: dto.status },
      req.ip,
    );
    return result;
  }
}
