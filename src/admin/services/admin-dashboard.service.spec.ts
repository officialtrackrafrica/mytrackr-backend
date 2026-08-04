import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
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
});
