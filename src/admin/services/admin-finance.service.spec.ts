import { AdminFinanceService } from './admin-finance.service';

describe('AdminFinanceService', () => {
  it('returns raw Mono transaction money in major currency units', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'transaction-id',
            amount: 12345,
            balance: 50000,
            currency: 'NGN',
          },
        ],
        1,
      ]),
    };
    const transactionsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new AdminFinanceService(
      transactionsRepository as any,
      {} as any,
    );

    const result = await service.getAllTransactions({});

    expect(result.transactions[0].amount).toBe(123.45);
    expect(result.transactions[0].balance).toBe(500);
    expect(result.transactions[0].currency).toBe('NGN');
  });

  it('returns NGN financial summaries in naira', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          period: '2026-08',
          type: 'credit',
          count: '2',
          totalAmount: '12345',
        },
      ]),
    };
    const transactionsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new AdminFinanceService(
      transactionsRepository as any,
      {} as any,
    );

    const result = await service.getFinancialSummary('month');

    expect(queryBuilder.where).toHaveBeenCalledWith('tx.currency = :currency', {
      currency: 'NGN',
    });
    expect(result).toEqual({
      period: 'month',
      currency: 'NGN',
      data: [
        {
          period: '2026-08',
          credits: 123.45,
          debits: 0,
          creditCount: 2,
          debitCount: 0,
        },
      ],
    });
  });

  it('returns linked account balances in major currency units', async () => {
    const accountsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'account-id',
          balance: 250050,
          currency: 'NGN',
        },
      ]),
    };
    const service = new AdminFinanceService(
      {} as any,
      accountsRepository as any,
    );

    const result = await service.getAllAccounts();

    expect(result[0].balance).toBe(2500.5);
    expect(result[0].currency).toBe('NGN');
  });
});
