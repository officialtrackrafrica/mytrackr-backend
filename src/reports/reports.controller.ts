import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
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
import { PnlService } from './services/pnl.service';
import { CashFlowService } from './services/cash-flow.service';
import { BalanceSheetService } from './services/balance-sheet.service';
import { AnalyticsService } from './services/analytics.service';

import { SWAGGER_TAGS } from '../common/docs';

@ApiTags(SWAGGER_TAGS[10].name)
@Controller('reports')
@UseGuards(JwtAuthGuard, PlanGuard)
@RequirePlan()
@ApiCookieAuth('accessToken')
export class ReportsController {
  constructor(
    private readonly pnlService: PnlService,
    private readonly cashFlowService: CashFlowService,
    private readonly balanceSheetService: BalanceSheetService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('pnl')
  @ApiOperation({
    summary: 'Generate Profit & Loss statement',
    description:
      "Calculates P&L for the user's business within a date range. Excludes uncategorised and TRANSFER transactions.",
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
  @ApiResponse({ status: 200, description: 'P&L statement data' })
  async getPnl(
    @Req() req: any,
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

    return this.pnlService.calculatePnl(req.user.id, start, end);
  }

  @Get('cash-flow')
  @ApiOperation({
    summary: 'Generate Cash Flow statement',
    description:
      "Calculates cash flow for the user's business including runway and burn rate. Includes ALL transactions.",
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Cash flow statement data' })
  async getCashFlow(
    @Req() req: any,
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

    return this.cashFlowService.calculateCashFlow(req.user.id, start, end);
  }

  @Get('balance-sheet')
  @ApiOperation({
    summary: 'Generate Balance Sheet',
    description:
      "Calculates assets, liabilities, and owner equity for the user's business.",
  })
  @ApiResponse({ status: 200, description: 'Balance sheet data' })
  async getBalanceSheet(@Req() req: any) {
    return this.balanceSheetService.calculateBalanceSheet(req.user.id);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get time-series analytics for Sales and P&L',
    description:
      'Returns daily, weekly, or monthly revenue, expenses, and net profit for charting purposes.',
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({
    name: 'interval',
    required: false,
    enum: ['day', 'week', 'month'],
    default: 'day',
  })
  @ApiResponse({ status: 200, description: 'Time-series analytics data' })
  async getAnalytics(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('interval') interval: 'day' | 'week' | 'month' = 'day',
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!startDate || isNaN(start.getTime())) {
      throw new BadRequestException('Invalid or missing startDate');
    }
    if (!endDate || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid or missing endDate');
    }

    return this.analyticsService.getAnalytics(
      req.user.id,
      start,
      end,
      interval,
    );
  }

  @Get('pnl/export')
  @ApiOperation({
    summary: 'Export Profit & Loss report to CSV',
    description: "Downloads the user's business P&L report as a CSV file.",
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportPnl(
    @Req() req: any,
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

    const csv = await this.pnlService.generatePnlCsv(req.user.id, start, end);
    return csv;
  }
}
