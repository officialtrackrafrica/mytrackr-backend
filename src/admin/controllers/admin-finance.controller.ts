import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminFinanceService } from '../services/admin-finance.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { TransactionQueryDto, DashboardQueryDto } from '../dto';

@ApiTags('Admin - Finance & Subscriptions')
@ApiCookieAuth('accessToken')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminFinanceController {
  constructor(
    private readonly financeService: AdminFinanceService,
    private readonly auditService: AdminAuditService,
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
}
