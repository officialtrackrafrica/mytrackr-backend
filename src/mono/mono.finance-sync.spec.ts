import { MonoService } from './mono.service';

describe('Finance transaction refresh', () => {
  let service: MonoService;
  let repo: any;
  let fetch: jest.Mock;
  let project: jest.Mock;
  let account: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T10:00:00Z'));
    account = {
      id: 'account', monoAccountId: 'mono',
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
      monoAccountRepository: repo, financeSyncs: new Map(),
      fetchAndStoreTransactions: fetch,
      transactionSyncService: { syncAccountTransactions: project },
      logger: { log: jest.fn(), error: jest.fn() },
    });
  });

  afterEach(() => jest.useRealTimers());

  it('syncs through now and reuses today regardless of the display range', async () => {
    await service.syncUserTransactionsForFinance('user', '2026-10-01');
    expect(fetch).toHaveBeenCalledWith(expect.anything(),
      new Date('2026-10-14T10:00:00Z'), new Date(), false);
    expect(project).toHaveBeenCalledWith('mono');
    await service.syncUserTransactionsForFinance('user', '2026-10-22');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalledWith({ where: { user: { id: 'user' } } });
  });

  it('serializes simultaneous requests so they share the daily refresh', async () => {
    await Promise.all([
      service.syncUserTransactionsForFinance('user'),
      service.syncUserTransactionsForFinance('user'),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
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
    expect(fetch).toHaveBeenCalledWith(expect.anything(),
      new Date('2025-12-01'), new Date('2026-01-01'), false);
  });

  it('does not mark failed downloads fresh and retries the next request', async () => {
    fetch.mockRejectedValueOnce(new Error('Mono unavailable'));
    await expect(service.syncUserTransactionsForFinance('user')).rejects.toThrow('Mono unavailable');
    expect(repo.update).not.toHaveBeenCalled();
    await service.syncUserTransactionsForFinance('user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates pagination failures without advancing sync boundaries', async () => {
    delete (service as any).fetchAndStoreTransactions;
    Object.assign(service, {
      monoGet: jest.fn()
        .mockResolvedValueOnce({ data: [], meta: { next: 'page2' } })
        .mockRejectedValueOnce(new Error('page two failed')),
    });
    await expect(service.syncUserTransactionsForFinance('user')).rejects.toThrow('page two failed');
    expect(repo.update).not.toHaveBeenCalled();
  });
});
