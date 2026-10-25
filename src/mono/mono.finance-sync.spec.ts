import { MonoService, TransactionSyncProcessing } from './mono.service';

describe('Finance transaction refresh', () => {
  let service: MonoService;
  let repo: any;
  let fetch: jest.Mock;
  let project: jest.Mock;
  let account: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T10:00:00Z'));
    account = {
      id: 'account',
      monoAccountId: 'mono',
      lastSyncedAt: new Date('2026-10-14T10:00:00Z'),
      earliestSyncedAt: new Date('2026-01-01T00:00:00Z'),
    };
    repo = {
      find: jest.fn(async () => [{ ...account }]),
      update: jest.fn(async (_where, values) => Object.assign(account, values)),
    };
    fetch = jest.fn().mockResolvedValue(undefined);
    project = jest.fn().mockResolvedValue({ synced: 1 });
    service = Object.create(MonoService.prototype);
    Object.assign(service, {
      monoAccountRepository: repo,
      financeSyncs: new Map(),
      fetchAndStoreTransactions: fetch,
      transactionSyncService: { syncAccountTransactions: project },
      logger: {
        log: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
      },
    });
  });

  afterEach(() => jest.useRealTimers());

  it('syncs through now and reuses a recent sync regardless of the display range', async () => {
    await service.syncUserTransactionsForFinance('user', '2026-10-01');
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      new Date('2026-10-14T10:00:00Z'),
      new Date(),
      false,
      true,
    );
    expect(project).toHaveBeenCalledWith('mono');
    await service.syncUserTransactionsForFinance('user', '2026-10-22');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalledWith({ where: { user: { id: 'user' } } });
  });

  it('serializes simultaneous requests so they share the recent refresh', async () => {
    await Promise.all([
      service.syncUserTransactionsForFinance('user'),
      service.syncUserTransactionsForFinance('user'),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes again after five minutes on the same day', async () => {
    await service.syncUserTransactionsForFinance('user');
    jest.advanceTimersByTime(5 * 60 * 1000);
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('imports a finished statement job without launching another realtime job', async () => {
    const previousSync = account.lastSyncedAt;
    repo.findOne = jest.fn().mockResolvedValue({ ...account });
    await service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { account: 'mono', name: 'jobs.accounts.sync_statement', status: 'finished' },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(), previousSync, expect.any(Date), false, false,
    );
    expect(project).toHaveBeenCalledWith('mono');
  });

  it.each(['processing', 'failed'])('does not import a %s job', async (status) => {
    await service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { account: 'mono', name: 'jobs.accounts.sync_statement', status },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  });

  it('refreshes on a new Lagos day even before UTC midnight', async () => {
    account.lastSyncedAt = new Date('2026-10-21T22:30:00Z');
    jest.setSystemTime(new Date('2026-10-21T23:30:00Z'));
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((service as any).formatDateForMono(new Date())).toBe('22-10-2026');
  });

  it('backfills older requested history even when today is already fresh', async () => {
    account.lastSyncedAt = new Date();
    await service.syncUserTransactionsForFinance('user', '2025-12-01');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      new Date('2025-12-01'),
      new Date('2026-01-01'),
      false,
    );
  });

  it('does not mark failed downloads fresh and retries the next request', async () => {
    fetch.mockRejectedValueOnce(new Error('Mono unavailable'));
    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).rejects.toThrow('Mono unavailable');
    expect(repo.update).not.toHaveBeenCalled();
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates pagination failures without advancing sync boundaries', async () => {
    delete (service as any).fetchAndStoreTransactions;
    Object.assign(service, {
      monoGet: jest
        .fn()
        .mockResolvedValueOnce({ data: { meta: { data_status: 'AVAILABLE' } } })
        .mockResolvedValueOnce({ data: [], meta: { next: 'page2' } })
        .mockRejectedValueOnce(new Error('page two failed')),
    });
    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).rejects.toThrow('page two failed');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('starts realtime on the first page and reads subsequent pages without another refresh', async () => {
    delete (service as any).fetchAndStoreTransactions;
    const monoGet = jest
      .fn()
      .mockResolvedValueOnce({ data: { meta: { data_status: 'AVAILABLE' } } })
      .mockResolvedValueOnce({
        data: [{ id: 'tx-1' }],
        meta: { next: 'page2' },
      })
      .mockResolvedValueOnce({ data: [], meta: { next: null } });
    const upsert = jest.fn().mockResolvedValue(undefined);
    Object.assign(service, { monoGet, upsertTransactions: upsert });

    await service.syncUserTransactionsForFinance('user');

    expect(monoGet).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('page=1'),
      { 'x-realtime': 'true' },
    );
    expect(monoGet).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('page=2'),
      { 'x-realtime': 'false' },
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.anything(),
      [{ id: 'tx-1' }],
      false,
    );
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data_status: 'UNAVAILABLE' },
    { data_status: 'PARTIAL', retrieved_data: ['balance'] },
  ])(
    'does not advance sync boundaries when transaction data is unavailable: %j',
    async (meta) => {
      delete (service as any).fetchAndStoreTransactions;
      const monoGet = jest.fn().mockResolvedValue({ data: { meta } });
      Object.assign(service, { monoGet });

      await expect(
        service.syncTransactionsForAccount(account, undefined, false, false, false, false),
      ).rejects.toThrow('not available yet');
      expect(monoGet).toHaveBeenCalledTimes(1);
      expect(repo.update).not.toHaveBeenCalled();
      expect(project).not.toHaveBeenCalled();
    },
  );

  it('attempts realtime recovery when old account data is unavailable', async () => {
    delete (service as any).fetchAndStoreTransactions;
    const monoGet = jest.fn()
      .mockResolvedValueOnce({ data: { meta: { data_status: 'UNAVAILABLE' } } })
      .mockResolvedValueOnce({ data: [], meta: { next: null } });
    Object.assign(service, { monoGet });
    await service.syncUserTransactionsForFinance('user');
    expect(monoGet).toHaveBeenNthCalledWith(
      2, expect.stringContaining('/transactions?'), { 'x-realtime': 'true' },
    );
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('imports partial accounts when transactions are available', async () => {
    delete (service as any).fetchAndStoreTransactions;
    Object.assign(service, {
      monoGet: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            meta: { data_status: 'PARTIAL', retrieved_data: ['transactions'] },
          },
        })
        .mockResolvedValueOnce({ data: [], meta: { next: null } }),
    });
    await service.syncUserTransactionsForFinance('user');
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('does not treat malformed transaction responses as successful empty downloads', async () => {
    delete (service as any).fetchAndStoreTransactions;
    Object.assign(service, {
      monoGet: jest
        .fn()
        .mockResolvedValueOnce({ data: { meta: { data_status: 'AVAILABLE' } } })
        .mockResolvedValueOnce({ status: 'successful', data: null }),
    });
    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).rejects.toThrow('invalid transaction response');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('imports completed account updates even for accounts already synced', async () => {
    repo.findOne = jest
      .fn()
      .mockResolvedValue({ ...account, businessId: 'business' });
    const sync = jest
      .spyOn(service, 'syncTransactionsForAccount')
      .mockResolvedValue(undefined);
    Object.assign(service, {
      enrichTransactionMetadata: jest.fn().mockResolvedValue({}),
    });

    await service.handleWebhookEvent({
      event: 'mono.events.account_updated',
      data: {
        account: { _id: 'mono' },
        meta: { data_status: 'AVAILABLE', sync_status: 'SUCCESSFUL' },
      },
    });

    expect(sync).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      true,
      false,
      false,
      false,
    );
    expect(project).toHaveBeenCalledWith('mono');
  });

  it.each(['PROCESSING', 'UNAVAILABLE', 'FAILED'])(
    'does not import unready account updates: %s',
    async (dataStatus) => {
      repo.findOne = jest
        .fn()
        .mockResolvedValue({ ...account, businessId: 'business' });
      const sync = jest
        .spyOn(service, 'syncTransactionsForAccount')
        .mockResolvedValue(undefined);
      await service.handleWebhookEvent({
        event: 'mono.events.account_updated',
        data: { account: { _id: 'mono' }, meta: { data_status: dataStatus } },
      });
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it('surfaces refresh errors instead of returning stale transactions as a successful sync', async () => {
    fetch.mockRejectedValueOnce(new Error('Bank unavailable'));
    const readCache = jest.fn();
    Object.assign(service, { getTransactionsFromDb: readCache });

    await expect(service.getAllUserTransactions('user')).rejects.toThrow(
      'Bank unavailable',
    );
    expect(readCache).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'REAUTHORISATION_REQUIRED'])(
    'does not import an unsuccessful refresh even when old data is available: %s',
    async (syncStatus) => {
      repo.findOne = jest
        .fn()
        .mockResolvedValue({ ...account, businessId: 'business' });
      const sync = jest
        .spyOn(service, 'syncTransactionsForAccount')
        .mockResolvedValue(undefined);
      await service.handleWebhookEvent({
        event: 'mono.events.account_updated',
        data: {
          account: { _id: 'mono' },
          meta: { data_status: 'AVAILABLE', sync_status: syncStatus },
        },
      });
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it('returns processing without advancing the sync cursor, then retries successfully', async () => {
    fetch.mockRejectedValueOnce(new TransactionSyncProcessing());

    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).resolves.toEqual({
      status: 'processing',
      message: expect.stringContaining('Showing saved transactions'),
    });
    expect(repo.update).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();

    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).resolves.toEqual({ status: 'completed' });
    expect(project).toHaveBeenCalledTimes(1);
  });

  it('returns saved linked-account history while the bank refresh is processing', async () => {
    fetch.mockRejectedValueOnce(new TransactionSyncProcessing());
    const cached = {
      totalAccounts: 1,
      transactions: [{ data: [{ id: 'saved-tx' }] }],
    };
    Object.assign(service, {
      getTransactionsFromDb: jest.fn().mockResolvedValue(cached),
    });

    await expect(service.getAllUserTransactions('user')).resolves.toEqual({
      ...cached,
      sync: { status: 'processing', message: expect.any(String) },
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('reports processing when initial account data is still being prepared', async () => {
    delete (service as any).fetchAndStoreTransactions;
    const monoGet = jest
      .fn()
      .mockResolvedValue({ data: { meta: { data_status: 'PROCESSING' } } });
    Object.assign(service, { monoGet });

    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).resolves.toEqual({
      status: 'processing',
      message: expect.any(String),
    });
    expect(monoGet).toHaveBeenCalledTimes(1);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it.each(['processing', 'failed'])(
    'does not accept a realtime job with status %s as completed',
    async (status) => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
        headers: new Headers({ 'x-job-status': status, 'x-job-id': 'tracked-job' }),
      });
      Object.assign(service, { configService: { get: () => 'test-key' } });
      try {
        await expect(
          (service as any).monoGet('/accounts/mono/transactions', {
            'x-realtime': 'true',
          }),
        ).rejects.toThrow(status === 'processing' ? 'processing' : 'failed');
        expect(repo.update).toHaveBeenCalledWith(
          { monoAccountId: 'mono' },
          { syncJobId: 'tracked-job', syncJobStatus: status, syncJobCheckedAt: expect.any(Date) },
        );
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});
