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
      auditLogRepository: { create: jest.fn(value => value), save: jest.fn().mockResolvedValue({}) },
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

  it('reuses a sync within one hour and refreshes at the cooldown boundary', async () => {
    await service.syncUserTransactionsForFinance('user');
    jest.advanceTimersByTime(59 * 60 * 1000);
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 1000);
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('applies the one-hour cooldown to linked-account history', async () => {
    (service as any).getTransactionsFromDb = jest.fn().mockResolvedValue({ data: [] });
    await service.getAllUserTransactions('user');
    jest.advanceTimersByTime(59 * 60 * 1000);
    await service.getAllUserTransactions('user');
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 1000);
    await service.getAllUserTransactions('user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns frontend timing from the persisted sync and does not extend it on a cache hit', async () => {
    const first = await service.syncUserTransactionsForFinance('user');
    expect(first.cooldown).toMatchObject({
      durationSeconds: 3600, serverTime: '2026-10-22T10:00:00.000Z',
      nextRefreshAt: '2026-10-22T11:00:00.000Z', remainingSeconds: 3600, isActive: true,
      accounts: [{ accountId: 'mono', lastSyncedAt: '2026-10-22T10:00:00.000Z', nextRefreshAt: '2026-10-22T11:00:00.000Z', remainingSeconds: 3600, isActive: true }],
    });
    jest.advanceTimersByTime(10 * 60 * 1000);
    const cached = await service.syncUserTransactionsForFinance('user');
    expect(cached.cooldown).toMatchObject({
      nextRefreshAt: '2026-10-22T11:00:00.000Z', remainingSeconds: 3000, isActive: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('includes cooldown metadata in linked-account history and still permits forced refresh', async () => {
    (service as any).getTransactionsFromDb = jest.fn().mockResolvedValue({ data: [] });
    const first = await service.getAllUserTransactions('user');
    expect(first.sync.cooldown).toMatchObject({ durationSeconds: 3600, remainingSeconds: 3600 });
    jest.advanceTimersByTime(60 * 1000);
    const forced = await service.getAllUserTransactions('user', undefined, undefined, true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(forced.sync.cooldown).toMatchObject({ nextRefreshAt: '2026-10-22T11:01:00.000Z', remainingSeconds: 3600 });
  });

  it.each([new Error('Bank unavailable'), new TransactionSyncProcessing()])('does not start a new cooldown for an unsuccessful refresh: %s', async error => {
    account.lastSyncedAt = null;
    fetch.mockRejectedValueOnce(error);
    const result = await service.syncUserTransactionsForFinance('user');
    expect(result.status).toBe(error instanceof TransactionSyncProcessing ? 'processing' : 'failed');
    expect(result.cooldown).toMatchObject({ durationSeconds: 3600, remainingSeconds: 0, isActive: false, nextRefreshAt: null });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('returns consistent cooldown metadata when no accounts are linked', async () => {
    repo.find.mockResolvedValue([]);
    const finance = await service.syncUserTransactionsForFinance('user');
    const linked = await service.getAllUserTransactions('user');
    expect(finance.cooldown).toMatchObject({ durationSeconds: 3600, remainingSeconds: 0, isActive: false, nextRefreshAt: null, accounts: [] });
    expect(linked.sync.cooldown).toEqual(finance.cooldown);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['jobs.accounts.sync_statement', 'RTSTMT'])('imports a finished %s job without launching another realtime job', async (name) => {
    const previousSync = account.lastSyncedAt;
    repo.findOne = jest.fn().mockResolvedValue({ ...account });
    await service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { account: 'mono', name, status: 'finished' },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(), previousSync, expect.any(Date), false, false,
    );
    expect(project).toHaveBeenCalledWith('mono');
  });

  it('records a failed RTSTMT delivery for the tracked job without importing', async () => {
    await service.handleWebhookEvent({
      event: 'mono.accounts.jobs.update',
      data: { account: 'mono', id: 'job-1', name: 'RTSTMT', status: 'failed' },
    });
    expect(repo.update).toHaveBeenCalledWith(
      { monoAccountId: 'mono', syncJobId: 'job-1' },
      { syncJobStatus: 'failed', syncJobCheckedAt: expect.any(Date) },
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
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
    ).resolves.toMatchObject({ status: 'failed' });
    expect(repo.update).not.toHaveBeenCalled();
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports pagination failures without advancing sync boundaries', async () => {
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
    ).resolves.toMatchObject({ status: 'failed' });
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

  it('reconciles all pages together so identical occurrences are not matched twice', async () => {
    delete (service as any).fetchAndStoreTransactions;
    const upsert = jest.fn().mockResolvedValue(undefined);
    Object.assign(service, {
      monoGet: jest.fn()
        .mockResolvedValueOnce({ data: { meta: { data_status: 'AVAILABLE' } } })
        .mockResolvedValueOnce({ data: [{ id: 'first' }], meta: { next: 'page2' } })
        .mockResolvedValueOnce({ data: [{ id: 'second' }], meta: { next: null } }),
      upsertTransactions: upsert,
    });
    await service.syncUserTransactionsForFinance('user');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.anything(), [{ id: 'first' }, { id: 'second' }], false);
  });

  it('does not persist a partial download when a later page fails', async () => {
    delete (service as any).fetchAndStoreTransactions;
    const upsert = jest.fn();
    Object.assign(service, {
      monoGet: jest.fn()
        .mockResolvedValueOnce({ data: { meta: { data_status: 'AVAILABLE' } } })
        .mockResolvedValueOnce({ data: [{ id: 'first' }], meta: { next: 'page2' } })
        .mockRejectedValueOnce(new Error('page two failed')),
      upsertTransactions: upsert,
    });
    await expect(service.syncUserTransactionsForFinance('user')).resolves.toMatchObject({ status: 'failed' });
    expect(upsert).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
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
    ).resolves.toMatchObject({ status: 'failed' });
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

  it.each(['Bank unavailable', 'Insufficient wallet balance to process api call'])(
    'returns stored history and records the refresh failure: %s', async (message) => {
      fetch.mockRejectedValueOnce(new Error(message));
      const cached = { transactions: [{ id: 'saved-tx' }] };
      Object.assign(service, { getTransactionsFromDb: jest.fn().mockResolvedValue(cached) });
      await expect(service.getAllUserTransactions('user')).resolves.toMatchObject({
        ...cached, sync: { status: 'failed' },
      });
      expect((service as any).auditLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        action: 'TRANSACTION_SYNC_FAILED', userId: 'user', resourceId: 'mono',
        details: { message, servingStoredTransactions: true },
      }));
    },
  );

  it('keeps finance history available even when audit logging fails', async () => {
    fetch.mockRejectedValueOnce(new Error('Mono unavailable'));
    (service as any).auditLogRepository.save.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.syncUserTransactionsForFinance('user')).resolves.toMatchObject({ status: 'failed' });
    expect(project).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('handles a projection failure without blocking stored finance history', async () => {
    project.mockRejectedValueOnce(new Error('Projection unavailable'));
    await expect(service.syncUserTransactionsForFinance('user')).resolves.toMatchObject({ status: 'failed' });
    expect((service as any).auditLogRepository.save).toHaveBeenCalled();
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
    ).resolves.toMatchObject({
      status: 'processing',
      message: expect.stringContaining('Showing saved transactions'),
    });
    expect(repo.update).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();

    await expect(
      service.syncUserTransactionsForFinance('user'),
    ).resolves.toMatchObject({ status: 'completed' });
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
      sync: expect.objectContaining({ status: 'processing', message: expect.any(String) }),
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
    ).resolves.toMatchObject({
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
