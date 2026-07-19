import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiResponse,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { PlanGuard } from '../common/access-control/guards/plan.guard';
import { RequirePlan } from '../common/access-control/decorators/require-plan.decorator';
import { PnlService } from './services/pnl.service';
import { CashFlowService } from './services/cash-flow.service';
import { BalanceSheetService } from './services/balance-sheet.service';
import { AnalyticsService } from './services/analytics.service';
import { SimplePdfReportService } from '../common/reports/simple-pdf-report.service';

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
    private readonly simplePdfReportService: SimplePdfReportService,
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
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportPnl(
    @Req() req: any,
    @Res() res: Response,
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
    return this.sendCsv(res, csv, 'mytrackr-profit-loss-report');
  }

  @Get('cash-flow/export')
  @ApiOperation({
    summary: 'Export Cash Flow statement to CSV',
    description:
      "Downloads the user's cash flow statement with burn rate and runway metrics as a CSV file.",
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCashFlow(
    @Req() req: any,
    @Res() res: Response,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.parseRequiredDateRange(startDate, endDate);
    const csv = await this.cashFlowService.generateCashFlowCsv(
      req.user.id,
      start,
      end,
    );
    return this.sendCsv(res, csv, 'mytrackr-cash-flow-statement');
  }

  @Get('pnl/export.pdf')
  @ApiOperation({
    summary: 'Export Profit & Loss report to PDF',
    description:
      "Downloads the user's business P&L report as a clean PDF file.",
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file download' })
  async exportPnlPdf(
    @Req() req: any,
    @Res() res: Response,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.parseRequiredDateRange(startDate, endDate);
    const report = await this.pnlService.calculatePnl(req.user.id, start, end);
    const lines = [
      `Period: ${this.formatDate(start)} to ${this.formatDate(end)}`,
      '',
      'REVENUE',
      ...report.revenue.lines.map((line) =>
        this.formatAmountLine(line.subCategory || 'Revenue', line.amount),
      ),
      this.formatAmountLine('Total Revenue', report.revenue.total),
      '',
      'COST OF GOODS SOLD',
      ...report.cogs.lines.map((line) =>
        this.formatAmountLine(line.subCategory || 'COGS', line.amount),
      ),
      this.formatAmountLine('Total COGS', report.cogs.total),
      '',
      this.formatAmountLine('Gross Profit', report.grossProfit),
      `Gross Profit Margin: ${report.grossProfitMargin.toFixed(2)}%`,
      '',
      'OPERATING EXPENSES',
      ...report.expenses.operating.lines.map((line) =>
        this.formatAmountLine(line.subCategory || 'Expense', line.amount),
      ),
      this.formatAmountLine(
        'Total Operating Expenses',
        report.expenses.operating.total,
      ),
      '',
      'OTHER EXPENSES',
      ...report.expenses.other.lines.map((line) =>
        this.formatAmountLine(line.subCategory || 'Other Expense', line.amount),
      ),
      this.formatAmountLine(
        'Total Other Expenses',
        report.expenses.other.total,
      ),
      '',
      this.formatAmountLine('Net Profit', report.netProfit),
      `Net Profit Margin: ${report.netProfitMargin.toFixed(2)}%`,
      `Uncategorised Transactions: ${report.metadata.uncategorisedCount}`,
    ];

    return this.sendPdf(
      res,
      this.simplePdfReportService.generate({
        title: 'MyTrackr Profit & Loss Report',
        lines,
      }),
      'mytrackr-profit-loss-report',
    );
  }

  @Get('cash-flow/export.pdf')
  @ApiOperation({
    summary: 'Export Cash Flow and burn rate report to PDF',
    description:
      "Downloads the user's cash flow report with monthly burn rate and runway metrics.",
  })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file download' })
  async exportCashFlowPdf(
    @Req() req: any,
    @Res() res: Response,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const { start, end } = this.parseRequiredDateRange(startDate, endDate);
    const report = await this.cashFlowService.calculateCashFlow(
      req.user.id,
      start,
      end,
    );
    const lines = [
      `Period: ${this.formatDate(start)} to ${this.formatDate(end)}`,
      '',
      this.formatAmountLine('Cash In', report.cashIn),
      this.formatAmountLine('Cash Out', report.cashOut),
      this.formatAmountLine('Net Cash Flow', report.netCashFlow),
      '',
      this.formatAmountLine(
        'Internal Transfer In',
        report.internalTransfers.internalIn,
      ),
      this.formatAmountLine(
        'Internal Transfer Out',
        report.internalTransfers.internalOut,
      ),
      '',
      this.formatAmountLine('Monthly Burn Rate', report.monthlyBurnRate),
      this.formatAmountLine('Cash Balance', report.cashBalance),
      `Months of Runway: ${report.monthsOfRunway ?? 'N/A'}`,
      `Low Runway Alert: ${report.lowRunwayAlert ? 'Yes' : 'No'}`,
    ];

    return this.sendPdf(
      res,
      this.simplePdfReportService.generate({
        title: 'MyTrackr Cash Flow & Burn Rate Report',
        lines,
      }),
      'mytrackr-cash-flow-burn-rate-report',
    );
  }

  private parseRequiredDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!startDate || isNaN(start.getTime())) {
      throw new BadRequestException('Invalid or missing startDate');
    }
    if (!endDate || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid or missing endDate');
    }

    return { start, end };
  }

  private sendPdf(res: Response, pdf: Buffer, filenamePrefix: string) {
    const filename = `${filenamePrefix}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  }

  private sendCsv(res: Response, csv: string, filenamePrefix: string) {
    const filename = `${filenamePrefix}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatAmountLine(label: string, amount: number): string {
    return `${label.padEnd(34, '.')} ${this.formatMoney(amount)}`;
  }

  private formatMoney(amount: number): string {
    return `NGN ${Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
