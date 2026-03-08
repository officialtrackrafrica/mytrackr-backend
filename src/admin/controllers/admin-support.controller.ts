import {
  Controller,
  Get,
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
  UpdateTicketDto,
  ResolveDisputeDto,
  TicketQueryDto,
  DisputeQueryDto,
} from '../dto';

@ApiTags('Admin - Support & Disputes')
@ApiBearerAuth()
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
