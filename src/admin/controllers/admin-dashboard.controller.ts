import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { AdminStatsQueryDto, DashboardQueryDto } from '../dto';
import { SimplePdfReportService } from '../../common/reports/simple-pdf-report.service';

@ApiTags('Admin - Dashboard')
@ApiCookieAuth('accessToken')
@Controller('admin')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly simplePdfReportService: SimplePdfReportService,
  ) {}

  @Get('stats')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get platform overview statistics' })
  @ApiResponse({ status: 200, description: 'Platform stats' })
  async getStats(@Query() query: AdminStatsQueryDto) {
    return this.dashboardService.getStats(query);
  }

  @Get('stats/export.pdf')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'Export platform overview statistics as PDF',
    description:
      'Downloads the admin platform statistics and plan breakdown using the same date filters as GET /admin/stats.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file download' })
  async exportStatsPdf(
    @Query() query: AdminStatsQueryDto,
    @Res() res: Response,
  ) {
    const stats = await this.dashboardService.getStats(query);
    const pdf = this.simplePdfReportService.generate({
      title: 'Platform Statistics Report',
      subtitle: 'Administrative dashboard overview',
      companyName: 'MyTrackr Admin',
      lines: this.buildStatsReportLines(stats),
    });
    const filename = `mytrackr-platform-statistics-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  }

  @Get('platform-stats')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({
    summary: 'Get platform and plan subscription statistics',
  })
  @ApiResponse({ status: 200, description: 'Platform stats' })
  async getPlatformStats(@Query() query: AdminStatsQueryDto) {
    return this.dashboardService.getStats(query);
  }

  @Get('registrations')
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Get user registration trends over time' })
  @ApiResponse({
    status: 200,
    description: 'Registration data grouped by period',
  })
  async getRegistrations(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRegistrations(query);
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

  private buildStatsReportLines(
    stats: Awaited<ReturnType<AdminDashboardService['getStats']>>,
  ): string[] {
    const changes = stats.percentageChanges;
    const lines = [
      `Period: ${this.formatReportPeriod(stats.filters)}`,
      '',
      'PLATFORM OVERVIEW',
      this.formatMetric('Total Users', stats.totalUsers, changes.totalUsers),
      this.formatMetric('Active Users', stats.activeUsers, changes.activeUsers),
      this.formatMetric(
        'Inactive Users',
        stats.inactiveUsers,
        changes.inactiveUsers,
      ),
      this.formatMetric(
        'Deleted Accounts',
        stats.deletedAccounts,
        changes.deletedAccounts,
      ),
      this.formatMetric(
        'Synced Bank Accounts',
        stats.totalSyncedBankAccounts,
        changes.totalSyncedBankAccounts,
      ),
      '',
      'TRANSACTIONS',
      this.formatMetric(
        'Total Transactions',
        stats.totalTransactions,
        changes.totalTransactions,
      ),
      this.formatAmountLine(
        'Total Transaction Volume',
        stats.totalTransactionVolume,
      ),
      `Transaction Volume Change: ${this.formatPercentageChange(
        changes.totalTransactionVolume,
      )}`,
      this.formatMetric(
        'Uncategorised Transactions',
        stats.uncategorizedTransactions,
        changes.uncategorizedTransactions,
      ),
      '',
      'SUBSCRIPTIONS',
      this.formatMetric(
        'Active Subscriptions',
        stats.activeSubscriptions,
        changes.activeSubscriptions,
      ),
      this.formatMetric(
        'Failed Subscriptions',
        stats.failedSubscriptions,
        changes.failedSubscriptions,
      ),
      this.formatAmountLine('Recurring Revenue', stats.recurringRevenue),
      `Recurring Revenue Change: ${this.formatPercentageChange(
        changes.recurringRevenue,
      )}`,
      this.formatAmountLine(
        'Realised Subscription Revenue',
        stats.realizedSubscriptionRevenue,
      ),
      `Realised Revenue Change: ${this.formatPercentageChange(
        changes.realizedSubscriptionRevenue,
      )}`,
      this.formatMetric('Churn Rate', `${stats.churnRate}%`, changes.churnRate),
      '',
      'SUBSCRIPTION PLANS',
    ];

    stats.planSubscriptionStats.forEach((plan) => {
      lines.push(
        '',
        `${plan.planName.toUpperCase()} PLAN`,
        `Billing Interval: ${plan.interval}`,
        this.formatAmountLine('Price', plan.price),
        this.formatMetric(
          'Total Subscriptions',
          plan.totalSubscriptions,
          plan.percentageChanges.totalSubscriptions,
        ),
        this.formatMetric(
          'Active Subscriptions',
          plan.activeSubscriptions,
          plan.percentageChanges.activeSubscriptions,
        ),
        this.formatMetric(
          'Pending Subscriptions',
          plan.pendingSubscriptions,
          plan.percentageChanges.pendingSubscriptions,
        ),
        this.formatMetric(
          'Canceled Subscriptions',
          plan.canceledSubscriptions,
          plan.percentageChanges.canceledSubscriptions,
        ),
        this.formatMetric(
          'Failed Subscriptions',
          plan.failedSubscriptions,
          plan.percentageChanges.failedSubscriptions,
        ),
        this.formatAmountLine('Recurring Revenue', plan.recurringRevenue),
        `Recurring Revenue Change: ${this.formatPercentageChange(
          plan.percentageChanges.recurringRevenue,
        )}`,
        this.formatMetric(
          'Churn Rate',
          `${plan.churnRate}%`,
          plan.percentageChanges.churnRate,
        ),
      );
    });

    return lines;
  }

  private formatReportPeriod(filters: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
  }): string {
    if (filters.date) {
      return filters.date;
    }
    if (filters.dateFrom && filters.dateTo) {
      return `${filters.dateFrom.slice(0, 10)} to ${filters.dateTo.slice(
        0,
        10,
      )} (end exclusive)`;
    }
    if (filters.dateFrom) {
      return `from ${filters.dateFrom.slice(0, 10)}`;
    }
    if (filters.dateTo) {
      return `until ${filters.dateTo.slice(0, 10)} (exclusive)`;
    }
    return 'All available data';
  }

  private formatMetric(
    label: string,
    value: number | string,
    percentageChange: number | null,
  ): string {
    return `${label}: ${value} (${this.formatPercentageChange(
      percentageChange,
    )})`;
  }

  private formatPercentageChange(value: number | null): string {
    if (value === null) {
      return 'comparison unavailable';
    }
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}% vs previous period`;
  }

  private formatAmountLine(label: string, amount: number): string {
    return `${label.padEnd(34, '.')} NGN ${Number(amount || 0).toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )}`;
  }
}
