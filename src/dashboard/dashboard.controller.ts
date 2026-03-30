import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { DashboardService } from './services/dashboard.service';
import { DashboardMetricsResponseDto } from './dto/dashboard.dto';
import { SWAGGER_TAGS } from '../common/docs';
import { AppException, ErrorResponseDto } from '../common/errors';

@ApiTags(SWAGGER_TAGS[7].name)
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get dashboard metrics',
    description:
      "Returns key financial metrics for the user's business: revenue, expenses, net profit, cash balance, uncategorised items, and burn rate.",
  })
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
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics',
    type: DashboardMetricsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or missing dates',
    type: ErrorResponseDto,
  })
  async getDashboard(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = now;

    const start = startDate ? new Date(startDate) : defaultStart;
    const end = endDate ? new Date(endDate) : defaultEnd;

    if (isNaN(start.getTime())) {
      throw AppException.badRequest(
        'Invalid startDate format',
        'DASHBOARD_INVALID_DATE_RANGE',
      );
    }
    if (isNaN(end.getTime())) {
      throw AppException.badRequest(
        'Invalid endDate format',
        'DASHBOARD_INVALID_DATE_RANGE',
      );
    }

    return this.dashboardService.getDashboardMetrics(req.user.id, start, end);
  }
}
