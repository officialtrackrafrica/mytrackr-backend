import { MonoService, TransactionSyncProcessing } from './mono.service';

describe('Mono account balance refresh', () => {
  let service: MonoService;
  let saved: any;
  let dashboardBalance: number;
  let repo: any;
  let projectBalance: jest.Mock;
  let projectTransactions: jest.Mock;
  let monoGet: jest.Mock;

  beforeEach(() => {
    saved = {
      id: 'account',
      monoAccountId: 'mono',
      balance: 10000,
      lastSyncedAt: new Date('2026-10-01T10:00:00Z'),
      earliestSyncedAt: new Date('2026-01-01T00:00:00Z'),
      businessId: 'business',
      user: { id: 'user' },
    };
    dashboardBalance = 100;
    repo = {
      findOne: jest.fn(async () => ({ ...saved })),
      find: jest.fn(async () => [{ ...saved }]),
      update: jest.fn(async (_where, values) => Object.assign(saved, values)),
    };
    projectBalance = jest.fn(async () => {
      dashboardBalance = Number(saved.balance) / 100;
    });
    projectTransactions = jest.fn().mockResolvedValue({ synced: 0 });
    monoGet = jest.fn();
    service = Object.assign(Object.create(MonoService.prototype), {
      monoAccountRepository: repo,
      monoGet,
      financeSyncs: new Map(),
      transactionSyncService: {
        syncAccountBalance: projectBalance,
        syncAccountTransactions: projectTransactions,
      },
      upsertTransactions: jest.fn(),
      logger: {
        log: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });
  });

  const details = (balance: unknown) => ({
    data: { account: { balance }, meta: { data_status: 'AVAILABLE' } },
  });
  const page = { data: [], meta: { next: null } };
  const download = (service: MonoService, account: any, realtime: boolean) =>
    (service as any).fetchAndStoreTransactions(
      account,
      new Date('2026-10-01'),
      new Date('2026-10-29'),
      false,
      realtime,
    );

  it('reads details again after realtime finishes and updates linked and dashboard balances', async () => {
    monoGet
      .mockResolvedValueOnce(details(10000))
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(details('250025'));
    const account = { ...saved };
    await download(service, account, true);
    expect(monoGet.mock.calls.map(([url]) => url)).toEqual([
      '/accounts/mono',
      expect.stringContaining('/transactions?'),
      '/accounts/mono',
    ]);
    expect(saved.balance).toBe(250025);
    expect(account.balance).toBe(250025);
    expect(dashboardBalance).toBe(2500.25);
    expect(projectBalance).toHaveBeenCalledWith('mono');
  });

  it('copies the saved balance on a completed cached/job import without starting another refresh', async () => {
    monoGet.mockResolvedValueOnce(details(50000)).mockResolvedValueOnce(page);
    await download(service, { ...saved }, false);
    expect(monoGet).toHaveBeenCalledTimes(2);
    expect(monoGet).toHaveBeenNthCalledWith(2, expect.any(String), {
      'x-realtime': 'false',
    });
    expect(saved.balance).toBe(50000);
    expect(dashboardBalance).toBe(500);
  });

  it('does not replace a newer balance with pre-refresh details when the final details request fails', async () => {
    monoGet
      .mockResolvedValueOnce(details(1))
      .mockImplementationOnce(async () => {
        saved.balance = 90000;
        dashboardBalance = 900;
        return page;
      })
      .mockRejectedValueOnce(new Error('Temporary details outage'));
    await expect(
      download(service, { ...saved }, true),
    ).resolves.toBeUndefined();
    expect(saved.balance).toBe(90000);
    expect(dashboardBalance).toBe(900);
    expect(projectBalance).not.toHaveBeenCalled();
  });

  it('waits for async realtime completion before reading the refreshed balance', async () => {
    monoGet
      .mockResolvedValueOnce(details(1))
      .mockRejectedValueOnce(new TransactionSyncProcessing());
    await expect(download(service, { ...saved }, true)).rejects.toBeInstanceOf(
      TransactionSyncProcessing,
    );
    expect(saved.balance).toBe(10000);
    expect(projectBalance).not.toHaveBeenCalled();
  });

  it.each([0, '0', -12345])(
    'updates a valid balance-only webhook (%p) while transactions are processing',
    async (balance) => {
      await service.handleWebhookEvent({
        event: 'mono.events.account_updated',
        data: {
          account: { _id: 'mono', balance },
          meta: { data_status: 'PROCESSING' },
        },
      });
      expect(saved.balance).toBe(Number(balance));
      expect(dashboardBalance).toBe(Number(balance) / 100);
      expect(projectBalance).toHaveBeenCalledWith('mono');
      expect(projectTransactions).not.toHaveBeenCalled();
      expect(monoGet).not.toHaveBeenCalled();
    },
  );

  it('updates a PARTIAL balance-only webhook without requiring transaction data', async () => {
    await service.handleWebhookEvent({
      event: 'mono.accounts.account_updated',
      data: {
        account: { id: 'mono', balance: '456789' },
        meta: { data_status: 'PARTIAL', retrieved_data: ['balance'] },
      },
    });
    expect(saved.balance).toBe(456789);
    expect(dashboardBalance).toBe(4567.89);
    expect(projectTransactions).not.toHaveBeenCalled();
  });

  it.each([null, undefined, '', ' ', 'bad', NaN, Infinity, true, {}, []])(
    'does not clear a valid saved balance for an absent or invalid webhook balance: %p',
    async (balance) => {
      await service.handleWebhookEvent({
        event: 'mono.events.account_updated',
        data: {
          account: { _id: 'mono', balance },
          meta: { data_status: 'PROCESSING' },
        },
      });
      expect(saved.balance).toBe(10000);
      expect(dashboardBalance).toBe(100);
      expect(projectBalance).not.toHaveBeenCalled();
    },
  );
});
