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
      {} as any,
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
      {} as any,
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
      {} as any,
      {} as any,
    );

    const result = await service.getAllAccounts();

    expect(result[0].balance).toBe(2500.5);
    expect(result[0].currency).toBe('NGN');
  });

  it('returns paginated subscription history across users with filters', async () => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    const updatedAt = new Date('2026-08-02T00:00:00.000Z');
    const subscriptionQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'subscription-id',
            status: 'active',
            user: {
              id: 'user-id',
              email: 'customer@example.com',
              firstName: 'Ada',
              lastName: 'Lovelace',
            },
            plan: {
              id: 'plan-id',
              name: 'Solo',
              slug: 'solo',
              price: 5000,
              currency: 'NGN',
              interval: 'monthly',
            },
            gatewaySubscriptionId: 'sub_gateway',
            currentPeriodStart: createdAt,
            currentPeriodEnd: updatedAt,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            createdAt,
            updatedAt,
          },
        ],
        1,
      ]),
    };
    const paymentQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'payment-id',
          user: { id: 'user-id' },
          amount: 5000,
          currency: 'NGN',
          gateway: 'paystack',
          reference: 'ref_123',
          gatewayReference: 'gateway_ref',
          status: 'success',
          paymentMethod: 'card',
          metadata: { planId: 'plan-id' },
          createdAt,
          updatedAt,
        },
      ]),
    };
    const subscriptionsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(subscriptionQueryBuilder),
    };
    const paymentTransactionsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(paymentQueryBuilder),
    };
    const service = new AdminFinanceService(
      {} as any,
      {} as any,
      subscriptionsRepository as any,
      paymentTransactionsRepository as any,
    );

    const result = await service.getAllSubscriptionHistory({
      page: 2,
      limit: 10,
      userId: 'user-id',
      status: 'active',
      planId: 'plan-id',
      start: '2026-08-01',
      end: '2026-08-31',
    });

    expect(subscriptionQueryBuilder.skip).toHaveBeenCalledWith(10);
    expect(subscriptionQueryBuilder.take).toHaveBeenCalledWith(10);
    expect(subscriptionQueryBuilder.andWhere).toHaveBeenCalledWith(
      'user.id = :userId',
      { userId: 'user-id' },
    );
    expect(subscriptionQueryBuilder.andWhere).toHaveBeenCalledWith(
      'subscription.status = :status',
      { status: 'active' },
    );
    expect(subscriptionQueryBuilder.andWhere).toHaveBeenCalledWith(
      'plan.id = :planId',
      { planId: 'plan-id' },
    );
    expect(paymentQueryBuilder.where).toHaveBeenCalledWith(
      'user.id IN (:...userIds)',
      { userIds: ['user-id'] },
    );
    expect(result.subscriptions[0]).toMatchObject({
      id: 'subscription-id',
      status: 'active',
      user: {
        id: 'user-id',
        email: 'customer@example.com',
        name: 'Ada Lovelace',
      },
      plan: {
        id: 'plan-id',
        name: 'Solo',
        slug: 'solo',
        price: 5000,
      },
      payments: [
        {
          id: 'payment-id',
          amount: 5000,
          status: 'success',
        },
      ],
    });
    expect(result.pagination).toEqual({
      total: 1,
      page: 2,
      limit: 10,
      totalPages: 1,
    });
  });
});
