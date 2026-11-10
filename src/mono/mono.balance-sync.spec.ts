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

  it('reads the realtime balance endpoint after realtime finishes and updates linked and dashboard balances', async () => {
    monoGet
      .mockResolvedValueOnce(details(10000))
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ data: { balance: '250025' } });
    const account = { ...saved };
    await download(service, account, true);
    expect(monoGet.mock.calls.map(([url]) => url)).toEqual([
      '/accounts/mono',
      expect.stringContaining('/transactions?'),
      '/accounts/mono/balance',
    ]);
    expect(monoGet).toHaveBeenNthCalledWith(3, '/accounts/mono/balance', {
      'x-realtime': 'true',
    });
    expect(saved.balance).toBe(250025);
    expect(account.balance).toBe(250025);
    expect(dashboardBalance).toBe(2500.25);
    expect(projectBalance).toHaveBeenCalledWith('mono');
  });

  it('keeps the saved balance when the realtime balance request fails', async () => {
    monoGet
      .mockResolvedValueOnce(details(10000))
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error('Balance outage'));
    await download(service, { ...saved }, true);
    expect(monoGet).toHaveBeenCalledTimes(3);
    expect(saved.balance).toBe(10000);
    expect(dashboardBalance).toBe(100);
  });

  it('keeps the saved balance when the realtime balance job is still processing', async () => {
    monoGet
      .mockResolvedValueOnce(details(1))
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new TransactionSyncProcessing());
    await download(service, { ...saved }, true);
    expect(monoGet).toHaveBeenCalledTimes(3);
    expect(saved.balance).toBe(10000);
    expect(projectBalance).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'failed', data: { balance: 1 } },
    { data: { balance: null } },
    { data: { balance: 'invalid' } },
  ])('preserves balance for an invalid balance response: %p', async (response) => {
    monoGet.mockResolvedValueOnce(response);
    await service.refreshAccountBalance({ ...saved });
    expect(saved.balance).toBe(10000);
    expect(projectBalance).not.toHaveBeenCalled();
  });

  it('refreshes the live balance after a finished statement job webhook', async () => {
    const syncSpy = jest
      .spyOn(service, 'syncTransactionsForAccount')
      .mockResolvedValue(undefined);
    monoGet.mockResolvedValueOnce({ data: { balance: 123400 } });
    await service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { name: 'RTSTMT', account: 'mono', id: 'job', status: 'finished' },
    });
    expect(syncSpy).toHaveBeenCalled();
    expect(monoGet).toHaveBeenCalledWith('/accounts/mono/balance', { 'x-realtime': 'true' });
    expect(saved.balance).toBe(123400);
    expect(dashboardBalance).toBe(1234);
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

  it('does not copy a cached balance when Mono only retrieved transactions', async () => {
    const response = details(1);
    Object.assign(response.data.meta, { retrieved_data: ['transactions'] });
    monoGet.mockResolvedValueOnce(response).mockResolvedValueOnce(page);
    await download(service, { ...saved }, false);
    expect(saved.balance).toBe(10000);
    expect(projectBalance).not.toHaveBeenCalled();
  });

  it('reads a completed balance job without starting a new realtime session', async () => {
    monoGet.mockResolvedValueOnce({ data: { balance: 0 } });
    await service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { name: 'jobs.accounts.sync_balance', account: 'mono', id: 'balance-job', status: 'FINISHED' },
    });
    expect(monoGet).toHaveBeenCalledTimes(1);
    expect(monoGet).toHaveBeenCalledWith('/accounts/mono/balance', { 'x-realtime': 'false' });
    expect(saved.balance).toBe(0);
    expect(dashboardBalance).toBe(0);
    expect(projectTransactions).not.toHaveBeenCalled();
  });

  it('allows a failed completed balance read to be retried by Mono', async () => {
    monoGet.mockRejectedValueOnce(new Error('Balance outage'));
    await expect(service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { name: 'jobs.accounts.sync_balance', account: 'mono', id: 'balance-job', status: 'finished' },
    })).rejects.toThrow('Balance outage');
    expect(saved.balance).toBe(10000);
  });

  it('does not replace a concurrent webhook balance when the live balance read fails', async () => {
    monoGet
      .mockResolvedValueOnce(details(1))
      .mockImplementationOnce(async () => {
        saved.balance = 90000;
        dashboardBalance = 900;
        return page;
      })
      .mockRejectedValueOnce(new Error('Temporary balance outage'));
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

  it('ignores the old balance in a webhook that did not retrieve balance data', async () => {
    await service.handleWebhookEvent({
      event: 'mono.events.account_updated',
      data: {
        account: { _id: 'mono', balance: 1 },
        meta: { data_status: 'PARTIAL', retrieved_data: ['identity'] },
      },
    });
    expect(saved.balance).toBe(10000);
    expect(projectBalance).not.toHaveBeenCalled();
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
