import { SimplePdfReportService } from '../../common/reports/simple-pdf-report.service';
import { AdminDashboardController } from './admin-dashboard.controller';

describe('AdminDashboardController', () => {
  it('exports the filtered platform statistics as a PDF attachment', async () => {
    const query = { dateFrom: '2026-08-01', dateTo: '2026-08-06' };
    const dashboardService = {
      getStats: jest.fn().mockResolvedValue({
        filters: {
          date: undefined,
          dateFrom: '2026-08-01T00:00:00.000Z',
          dateTo: '2026-08-06T00:00:00.000Z',
          previousDateFrom: '2026-07-27T00:00:00.000Z',
          previousDateTo: '2026-08-01T00:00:00.000Z',
        },
        totalUsers: 12,
        totalSyncedBankAccounts: 4,
        activeUsers: 9,
        inactiveUsers: 3,
        deletedAccounts: 0,
        uncategorizedTransactions: 552,
        activeSubscriptions: 4,
        failedSubscriptions: 0,
        currency: 'NGN',
        recurringRevenue: 9700,
        realizedSubscriptionRevenue: 39600,
        churnRate: 20,
        planSubscriptionStats: [
          {
            planId: 'solo',
            planName: 'Solo',
            planSlug: 'solo',
            interval: 'monthly',
            currency: 'NGN',
            price: 2900,
            totalSubscriptions: 3,
            activeSubscriptions: 2,
            pendingSubscriptions: 0,
            canceledSubscriptions: 1,
            failedSubscriptions: 0,
            recurringRevenue: 5800,
            churnRate: 33.33,
            percentageChanges: {
              totalSubscriptions: 50,
              activeSubscriptions: 100,
              pendingSubscriptions: 0,
              canceledSubscriptions: null,
              failedSubscriptions: 0,
              recurringRevenue: 100,
              churnRate: null,
            },
          },
        ],
        totalLinkedAccounts: 4,
        totalTransactions: 1691,
        totalTransactionVolume: 66642223.1,
        percentageChanges: {
          totalUsers: 20,
          totalSyncedBankAccounts: 33.33,
          activeUsers: 12.5,
          inactiveUsers: 50,
          deletedAccounts: 0,
          uncategorizedTransactions: -8.15,
          activeSubscriptions: 33.33,
          failedSubscriptions: 0,
          recurringRevenue: 25,
          realizedSubscriptionRevenue: 10,
          churnRate: -5.25,
          totalLinkedAccounts: 33.33,
          totalTransactions: 18.42,
          totalTransactionVolume: 14.75,
        },
      }),
    };
    const controller = new AdminDashboardController(
      dashboardService as any,
      new SimplePdfReportService(),
    );
    const response = {
      setHeader: jest.fn(),
      send: jest.fn((body) => body),
    };

    const result = await controller.exportStatsPdf(query, response as any);

    expect(dashboardService.getStats).toHaveBeenCalledWith(query);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(
        /^attachment; filename="mytrackr-platform-statistics-\d{4}-\d{2}-\d{2}\.pdf"$/,
      ),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Length',
      expect.any(Number),
    );
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 8).toString()).toBe('%PDF-1.4');
  });
});
