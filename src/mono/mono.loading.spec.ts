import { MonoService } from './mono.service';

describe('linked account loading state', () => {
  const create = (account: Record<string, unknown>, ready = false) => {
    const projection = jest.fn().mockResolvedValue(ready);
    const service = Object.assign(Object.create(MonoService.prototype), {
      monoAccountRepository: { find: jest.fn().mockResolvedValue([account]) },
      transactionSyncService: { isAccountProjectionReady: projection },
    }) as MonoService;
    return { service, projection };
  };

  it('shows loading immediately after linking without querying projection readiness', async () => {
    const { service, projection } = create({ monoAccountId: 'mono' });
    expect((await service.getUserLinkedAccounts('user'))[0].isLoading).toBe(true);
    expect(projection).not.toHaveBeenCalled();
  });

  it.each([false, true])('waits for finance projection readiness: %s', async (ready) => {
    const { service } = create({ lastSyncedAt: new Date(), dataStatus: 'AVAILABLE' }, ready);
    expect((await service.getUserLinkedAccounts('user'))[0].isLoading).toBe(!ready);
  });

  it('keeps loading during a provider job even when saved data exists', async () => {
    const { service } = create({ lastSyncedAt: new Date(), syncJobStatus: 'processing' }, true);
    expect((await service.getUserLinkedAccounts('user'))[0].isLoading).toBe(true);
  });

  it.each([
    { dataStatus: 'DISCONNECTED' },
    { dataStatus: 'UNAVAILABLE' },
    { syncJobStatus: 'failed' },
    { syncStatus: 'FAILED' },
  ])('does not leave a stopped import spinning: %j', async (account) => {
    const { service, projection } = create(account);
    expect((await service.getUserLinkedAccounts('user'))[0].isLoading).toBe(false);
    expect(projection).not.toHaveBeenCalled();
  });
});
