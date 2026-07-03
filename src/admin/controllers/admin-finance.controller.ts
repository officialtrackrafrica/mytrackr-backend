import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AdminFinanceService } from '../services/admin-finance.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { TransactionQueryDto, DashboardQueryDto } from '../dto';
import {
  PlanResponseDto,
  UpdatePlanCapabilitiesDto,
  UpdatePlanPriceDto,
} from '../../payments/dto/subscription.dto';
import { SubscriptionService } from '../../payments/services/subscription.service';

@ApiTags('Admin - Finance & Subscriptions')
@ApiCookieAuth('accessToken')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminFinanceController {
  constructor(
    private readonly financeService: AdminFinanceService,
    private readonly auditService: AdminAuditService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Get('transactions')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List all platform transactions with filters' })
  @ApiResponse({ status: 200, description: 'Paginated transaction list' })
  async getAllTransactions(@Query() query: TransactionQueryDto) {
    return this.financeService.getAllTransactions(query);
  }

  @Get('accounts')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'List all linked bank accounts across all users' })
  @ApiResponse({ status: 200, description: 'All linked accounts' })
  async getAllAccounts() {
    return this.financeService.getAllAccounts();
  }

  @Get('reports/financial-summary')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Generate financial summary report' })
  @ApiResponse({
    status: 200,
    description: 'Financial summary grouped by period',
  })
  async getFinancialSummary(@Query() query: DashboardQueryDto) {
    return this.financeService.getFinancialSummary(query.period);
  }

  @Patch('subscription-plans/:id/price')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Update a subscription plan price' })
  @ApiBody({ type: UpdatePlanPriceDto })
  @ApiResponse({ status: 200, type: PlanResponseDto })
  async updateSubscriptionPlanPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanPriceDto,
  ) {
    return this.subscriptionService.updatePlanPrice(id, dto.price);
  }

  @Get('subscription-plans/capabilities')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'Get subscription plan feature/capability matrix',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan capability matrix for admin plan management',
  })
  async getSubscriptionPlanCapabilities() {
    return this.subscriptionService.getPlanCapabilityMatrix();
  }

  @Patch('subscription-plans/:id/capabilities')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'Update what a subscription plan can do',
  })
  @ApiBody({ type: UpdatePlanCapabilitiesDto })
  @ApiResponse({ status: 200, type: PlanResponseDto })
  async updateSubscriptionPlanCapabilities(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanCapabilitiesDto,
    @Req() req: any,
  ) {
    const result = await this.subscriptionService.updatePlanCapabilities(
      id,
      dto,
    );
    await this.auditService.log(
      'SUBSCRIPTION_PLAN_CAPABILITIES_UPDATED',
      'Plan',
      id,
      req.user.id,
      dto,
      req.ip,
    );
    return result;
  }
}
