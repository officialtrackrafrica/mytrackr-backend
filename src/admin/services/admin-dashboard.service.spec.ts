import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  const createStatsSnapshot = (overrides: Record<string, unknown> = {}) => ({
    totalUsers: 0,
    totalSyncedBankAccounts: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    deletedAccounts: 0,
    uncategorizedTransactions: 0,
    activeSubscriptions: 0,
    failedSubscriptions: 0,
    currency: 'NGN',
    recurringRevenue: 0,
    realizedSubscriptionRevenue: 0,
    churnRate: 0,
    planSubscriptionStats: [],
    totalLinkedAccounts: 0,
    totalTransactions: 0,
    totalTransactionVolume: 0,
    ...overrides,
  });

  it('uses only normalized finance transactions for platform statistics', async () => {
    const monoTransactionsRepository = {
      createQueryBuilder: jest.fn(),
    };
    const service = new AdminDashboardService(
      {} as any,
      {} as any,
      monoTransactionsRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest.spyOn(service as any, 'countUsers').mockResolvedValue(4);
    jest.spyOn(service as any, 'countDeletedAccounts').mockResolvedValue(1);
    jest.spyOn(service as any, 'countSyncedBankAccounts').mockResolvedValue(3);
    jest.spyOn(service as any, 'countFinanceTransactions').mockResolvedValue(7);
    jest
      .spyOn(service as any, 'sumFinanceTransactionVolume')
      .mockResolvedValue({ totalVolume: '1234.56' });
    jest
      .spyOn(service as any, 'countUncategorizedFinanceTransactions')
      .mockResolvedValue(2);
    jest.spyOn(service as any, 'countSubscriptions').mockResolvedValue(5);
    jest.spyOn(service as any, 'countFailedSubscriptions').mockResolvedValue(1);
    jest
      .spyOn(service as any, 'sumActiveSubscriptionRevenue')
      .mockResolvedValue({ total: '5000' });
    jest
      .spyOn(service as any, 'sumSuccessfulSubscriptionPayments')
      .mockResolvedValue({ total: '4500' });
    jest
      .spyOn(service as any, 'countChurnedSubscriptions')
      .mockResolvedValue(1);
    jest
      .spyOn(service as any, 'countChurnBaseSubscriptions')
      .mockResolvedValue(10);
    jest
      .spyOn(service as any, 'getPlanSubscriptionStats')
      .mockResolvedValue([]);

    const result = await service.getStats();

    expect(result.totalTransactions).toBe(7);
    expect(result.totalTransactionVolume).toBe(1234.56);
    expect(result.uncategorizedTransactions).toBe(2);
    expect(result.currency).toBe('NGN');
    expect(
      monoTransactionsRepository.createQueryBuilder,
    ).not.toHaveBeenCalled();
  });

  it('returns Mono transaction summaries in naira and only aggregates NGN', async () => {
    const summaryQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          type: 'credit',
          count: '2',
          totalAmount: '12345',
          avgAmount: '6172.5',
        },
      ]),
    };
    const categoryQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { category: 'income', count: '2', totalAmount: '12345' },
        ]),
    };
    const monoTransactionsRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(summaryQueryBuilder)
        .mockReturnValueOnce(categoryQueryBuilder),
    };
    const service = new AdminDashboardService(
      {} as any,
      {} as any,
      monoTransactionsRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getTransactionSummary();

    expect(summaryQueryBuilder.where).toHaveBeenCalledWith(
      'tx.currency = :currency',
      { currency: 'NGN' },
    );
    expect(categoryQueryBuilder.where).toHaveBeenCalledWith(
      'tx.currency = :currency',
      { currency: 'NGN' },
    );
    expect(result).toEqual({
      currency: 'NGN',
      byType: [
        { type: 'credit', count: 2, totalAmount: 123.45, avgAmount: 61.73 },
      ],
      byCategory: [{ category: 'income', count: 2, totalAmount: 123.45 }],
    });
  });

  it('returns percentage changes against the preceding equal-length period', async () => {
    const service = new AdminDashboardService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const current = createStatsSnapshot({
      totalUsers: 15,
      totalTransactions: 5,
      recurringRevenue: 1000,
      planSubscriptionStats: [
        {
          planId: 'solo',
          totalSubscriptions: 6,
          activeSubscriptions: 4,
          pendingSubscriptions: 0,
          canceledSubscriptions: 2,
          failedSubscriptions: 0,
          recurringRevenue: 400,
          churnRate: 33.33,
        },
      ],
    });
    const previous = createStatsSnapshot({
      totalUsers: 10,
      totalTransactions: 0,
      recurringRevenue: 800,
      planSubscriptionStats: [
        {
          planId: 'solo',
          totalSubscriptions: 4,
          activeSubscriptions: 4,
          pendingSubscriptions: 0,
          canceledSubscriptions: 0,
          failedSubscriptions: 0,
          recurringRevenue: 200,
          churnRate: 0,
        },
      ],
    });
    const snapshotSpy = jest
      .spyOn(service as any, 'getStatsSnapshot')
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(previous);

    const result = await service.getStats({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-06',
    });

    expect(snapshotSpy).toHaveBeenNthCalledWith(1, {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-06'),
    });
    expect(snapshotSpy).toHaveBeenNthCalledWith(2, {
      start: new Date('2026-07-27'),
      end: new Date('2026-08-01'),
    });
    expect(result.filters).toEqual({
      date: undefined,
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-06T00:00:00.000Z',
      previousDateFrom: '2026-07-27T00:00:00.000Z',
      previousDateTo: '2026-08-01T00:00:00.000Z',
    });
    expect(result.percentageChanges.totalUsers).toBe(50);
    expect(result.percentageChanges.recurringRevenue).toBe(25);
    expect(result.percentageChanges.totalTransactions).toBeNull();
    expect(result.planSubscriptionStats[0].percentageChanges).toMatchObject({
      totalSubscriptions: 50,
      activeSubscriptions: 0,
      recurringRevenue: 100,
      churnRate: null,
    });
  });

  it('filters registration trends by a single calendar date', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ period: '2026-08-06', count: '3' }]),
    };
    const service = new AdminDashboardService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.getRegistrations({
      period: 'day',
      date: '2026-08-06',
    });

    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'user.createdAt >= :user_createdAt_start',
      { user_createdAt_start: new Date('2026-08-06') },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'user.createdAt < :user_createdAt_end',
      { user_createdAt_end: new Date('2026-08-07') },
    );
    expect(result).toEqual({
      period: 'day',
      filters: {
        date: '2026-08-06',
        dateFrom: '2026-08-06T00:00:00.000Z',
        dateTo: '2026-08-07T00:00:00.000Z',
      },
      data: [{ period: '2026-08-06', count: 3 }],
    });
  });
});
