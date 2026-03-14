import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { DashboardService } from './services/dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get dashboard metrics',
    description:
      'Returns key financial metrics: revenue, expenses, net profit, cash balance, uncategorised items, and burn rate.',
  })
  @ApiQuery({ name: 'businessId', required: true, type: String })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'ISO date string e.g. 2025-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'ISO date string e.g. 2025-12-31',
  })
  @ApiResponse({ status: 200, description: 'Dashboard metrics' })
  async getDashboard(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!startDate || isNaN(start.getTime())) {
      throw new BadRequestException('Invalid or missing startDate');
    }
    if (!endDate || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid or missing endDate');
    }

    return this.dashboardService.getDashboardMetrics(businessId, start, end);
  }
}
