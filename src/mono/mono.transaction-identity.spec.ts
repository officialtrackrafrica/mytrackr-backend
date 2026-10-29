import { MonoService } from './mono.service';
import { MonoAccount } from './entities/mono-account.entity';
import { MonoTransaction } from './entities/transaction.entity';

describe('Mono identity import persistence', () => {
  const payment = {
    id: 'regenerated',
    date: '2026-10-18T12:05:00Z',
    amount: 290000,
    balance: 500000,
    type: 'credit',
    currency: 'NGN',
    narration: 'Payment',
  };
  let service: MonoService;
  let repository: any;
  let accountRepository: any;
  let builder: any;
  let rows: any[];

  beforeEach(() => {
    rows = [
      {
        ...payment,
        id: 'stored-row',
        monoAccountId: 'account',
        monoTransactionId: 'original',
        providerIdAliases: [],
        date: new Date(payment.date),
        createdAt: new Date(),
        manualCategory: 'Income',
        deletedAt: null,
      },
    ];
    let values: any[];
    let updatedColumns: string[];
    builder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn((input) => {
        values = input;
        return builder;
      }),
      orUpdate: jest.fn((columns) => {
        updatedColumns = columns;
        return builder;
      }),
      execute: jest.fn(async () => {
        for (const value of values) {
          const existing = rows.find(
            (row) => row.monoTransactionId === value.monoTransactionId,
          );
          if (existing) {
            for (const column of updatedColumns)
              existing[column] = value[column];
          } else
            rows.push({
              ...value,
              id: 'new-row',
              providerIdAliases: [],
              createdAt: new Date(),
            });
        }
      }),
    };
    repository = {
      find: jest.fn(async () => structuredClone(rows)),
      create: jest.fn((value) => value),
      createQueryBuilder: jest.fn(() => builder),
      update: jest.fn(async (id, update) =>
        Object.assign(
          rows.find((row) => row.id === id),
          update,
        ),
      ),
    };
    accountRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({ id: 'account' }),
    };
    repository.manager = {
      transaction: jest.fn(async (operation) =>
        operation({
          getRepository: (entity) =>
            entity === MonoAccount ? accountRepository : repository,
        }),
      ),
    };
    service = Object.create(MonoService.prototype);
    Object.assign(service, {
      transactionRepository: repository,
      resolveMonoTransactionCategory: jest.fn().mockResolvedValue(null),
      logger: { warn: jest.fn(), log: jest.fn() },
    });
  });

  it('persists aliases and keeps the finance-facing ID and manual categorization stable on retry', async () => {
    const account = { id: 'account', monoAccountId: 'provider-account' };
    await (service as any).upsertTransactions(account, [payment]);
    await (service as any).upsertTransactions(account, [payment]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      monoTransactionId: 'original',
      providerIdAliases: ['regenerated'],
      manualCategory: 'Income',
    });
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.find).toHaveBeenCalledWith({
      where: { monoAccountId: 'account' },
      withDeleted: true,
    });
    expect(accountRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: 'account' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(builder.into).toHaveBeenCalledWith(MonoTransaction);
  });

  it('persists suppression aliases without recreating user-deleted payments', async () => {
    rows[0].deletedAt = new Date();
    await (service as any).upsertTransactions({ id: 'account' }, [payment]);
    expect(rows[0].providerIdAliases).toEqual(['regenerated']);
    expect(builder.execute).not.toHaveBeenCalled();
  });

  it('reuses the original transaction when both balances are missing', async () => {
    rows[0].balance = null;
    const incoming = { ...payment, balance: null };
    await (service as any).upsertTransactions({ id: 'account' }, [incoming]);
    await (service as any).upsertTransactions({ id: 'account' }, [incoming]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      monoTransactionId: 'original',
      providerIdAliases: ['regenerated'],
      manualCategory: 'Income',
      balance: null,
    });
  });

  it('splits large downloads into bounded SQL batches within one import transaction', async () => {
    rows = [];
    const incoming = Array.from({ length: 501 }, (_, index) => ({
      ...payment,
      id: `payment-${index}`,
      amount: payment.amount + index,
    }));
    await (service as any).upsertTransactions({ id: 'account' }, incoming);
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(builder.values.mock.calls.map(([values]) => values.length)).toEqual([
      500, 1,
    ]);
    expect(rows).toHaveLength(501);
  });
});
