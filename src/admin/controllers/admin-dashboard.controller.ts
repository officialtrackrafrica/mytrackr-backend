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
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { DashboardQueryDto } from '../dto';

@ApiTags('Admin - Dashboard')
@ApiCookieAuth('accessToken')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('stats')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get platform overview statistics' })
  @ApiResponse({ status: 200, description: 'Platform stats' })
  async getStats() {
    return this.dashboardService.getStats();
  }

  @Get('registrations')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get user registration trends over time' })
  @ApiResponse({
    status: 200,
    description: 'Registration data grouped by period',
  })
  async getRegistrations(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRegistrations(query.period);
  }

  @Get('transactions/summary')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get aggregate transaction statistics' })
  @ApiResponse({
    status: 200,
    description: 'Transaction summary by type and category',
  })
  async getTransactionSummary() {
    return this.dashboardService.getTransactionSummary();
  }

  @Get('active-sessions')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get count of currently active sessions' })
  @ApiResponse({ status: 200, description: 'Active session count' })
  async getActiveSessions() {
    return this.dashboardService.getActiveSessions();
  }
}
