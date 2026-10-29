import { reconcileMonoTransactions } from './transaction-identity';
import { MonoTransaction } from './entities/transaction.entity';

describe('Mono transaction identity', () => {
  const payment = {
    id: 'old',
    date: '2026-10-18T12:05:00Z',
    amount: 290000,
    balance: 500000,
    type: 'credit',
    currency: 'NGN',
    narration: 'Payment',
  };
  const stored = (overrides: Partial<MonoTransaction> = {}): MonoTransaction =>
    ({
      ...payment,
      id: 'row-1',
      monoTransactionId: 'old',
      date: new Date(payment.date),
      createdAt: new Date('2026-10-18T13:00:00Z'),
      providerIdAliases: [],
      deletedAt: null,
      ...overrides,
    }) as MonoTransaction;

  it('reuses the original ID when Mono regenerates an ID', () => {
    const result = reconcileMonoTransactions(
      [{ ...payment, id: 'new' }],
      [stored()],
    );
    expect(result.transactions).toEqual([payment]);
    expect(result.aliases).toEqual([
      { id: 'row-1', providerIdAliases: ['new'] },
    ]);
  });

  it('recognizes persisted aliases without matching mutable bank details', () => {
    const result = reconcileMonoTransactions(
      [{ ...payment, id: 'new', balance: 600000 }],
      [stored({ providerIdAliases: ['new'] })],
    );
    expect(result.transactions[0]).toMatchObject({
      id: 'old',
      balance: 600000,
    });
    expect(result.aliases).toEqual([]);
  });

  it('preserves multiple identical occurrences and matches each only once', () => {
    const incoming = ['new-1', 'new-2', 'new-3'].map((id) => ({
      ...payment,
      id,
    }));
    const result = reconcileMonoTransactions(incoming, [
      stored(),
      stored({ id: 'row-2', monoTransactionId: 'old-2' }),
    ]);
    expect(result.transactions.map((tx) => tx.id)).toEqual([
      'old',
      'old-2',
      'new-3',
    ]);
    expect(result.aliases).toHaveLength(2);
  });

  it('reserves exact IDs before matching new IDs from earlier pages', () => {
    const result = reconcileMonoTransactions(
      [{ ...payment, id: 'new' }, payment],
      [stored()],
    );
    expect(result.transactions.map((tx) => tx.id)).toEqual(['new', 'old']);
    expect(result.aliases).toEqual([]);
  });

  it.each([
    { balance: 500001 },
    { date: '2026-10-18T12:05:01Z' },
    { amount: 290001 },
    { type: 'debit' },
    { currency: 'USD' },
    { narration: 'Another payment' },
    { balance: null },
    { date: 'invalid' },
  ])(
    'does not merge a transaction with differing or incomplete identity: %j',
    (change) => {
      const result = reconcileMonoTransactions(
        [{ ...payment, id: 'new', ...change }],
        [stored()],
      );
      expect(result.transactions[0].id).toBe('new');
      expect(result.aliases).toEqual([]);
    },
  );

  it('matches PostgreSQL bigint strings to numeric provider values', () => {
    const result = reconcileMonoTransactions(
      [{ ...payment, id: 'new' }],
      [stored({ amount: '290000' as any, balance: '500000' as any })],
    );
    expect(result.transactions[0].id).toBe('old');
  });

  it.each([null, undefined, ''])(
    'matches missing balances (%p) to stored NULL balances',
    (balance) => {
      const result = reconcileMonoTransactions(
        [{ ...payment, id: 'new', balance }],
        [stored({ balance: null })],
      );
      expect(result.transactions[0].id).toBe('old');
      expect(result.aliases).toEqual([
        { id: 'row-1', providerIdAliases: ['new'] },
      ]);
    },
  );

  it('does not confuse a missing balance with a zero balance', () => {
    const result = reconcileMonoTransactions(
      [{ ...payment, id: 'new', balance: 0 }],
      [stored({ balance: null })],
    );
    expect(result.transactions[0].id).toBe('new');
    expect(result.aliases).toEqual([]);
  });

  it('preserves occurrence counts when balances are missing', () => {
    const result = reconcileMonoTransactions(
      ['new-1', 'new-2', 'new-3'].map((id) => ({
        ...payment,
        id,
        balance: null,
      })),
      [
        stored({ balance: null }),
        stored({ id: 'row-2', monoTransactionId: 'old-2', balance: null }),
      ],
    );
    expect(result.transactions.map((tx) => tx.id)).toEqual([
      'old',
      'old-2',
      'new-3',
    ]);
  });

  it('does not resurrect a deleted payment under a regenerated ID', () => {
    const result = reconcileMonoTransactions(
      [{ ...payment, id: 'new' }],
      [stored({ deletedAt: new Date() })],
    );
    expect(result.transactions).toEqual([]);
    expect(result.aliases[0].providerIdAliases).toEqual(['new']);
  });

  it('handles canonical IDs, aliases and pagination overlap without duplicate upserts', () => {
    const result = reconcileMonoTransactions(
      [payment, payment, { ...payment, id: 'alias' }],
      [stored({ providerIdAliases: ['alias'] })],
    );
    expect(result.transactions).toEqual([payment]);
  });

  it('leaves existing duplicate records separate for reviewed cleanup', () => {
    const result = reconcileMonoTransactions(
      [
        { ...payment, id: 'new-1' },
        { ...payment, id: 'new-2' },
      ],
      [stored(), stored({ id: 'row-2', monoTransactionId: 'old-2' })],
    );
    expect(result.transactions.map((tx) => tx.id)).toEqual(['old', 'old-2']);
  });
});
