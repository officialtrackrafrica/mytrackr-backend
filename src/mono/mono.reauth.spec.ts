import { MonoService } from './mono.service';

describe('Mono reauthorization', () => {
  const create = (account: any) => {
    const repo = { find: jest.fn().mockResolvedValue([account]), findOne: jest.fn().mockResolvedValue(account) };
    const post = jest.fn().mockResolvedValue({ data: { mono_url: 'https://link.mono.co/reauth' } });
    const service = Object.assign(Object.create(MonoService.prototype), {
      monoAccountRepository: repo, monoPost: post, logger: { debug: jest.fn(), warn: jest.fn() },
    }) as MonoService;
    return { service, repo, post };
  };

  it('returns a fresh redirect URL for an account requiring reauthorization', async () => {
    const { service, repo, post } = create({ monoAccountId: 'mono', syncStatus: 'REAUTHORISATION_REQUIRED' });
    await expect(service.getUserLinkedAccounts('user')).resolves.toEqual([
      expect.objectContaining({ requiresReauthorization: true, reauthorizationUrl: 'https://link.mono.co/reauth' }),
    ]);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { monoAccountId: 'mono', user: { id: 'user' } } });
    expect(post).toHaveBeenCalledWith('/accounts/initiate', expect.objectContaining({ account: 'mono', scope: 'reauth' }));
    expect(post.mock.calls[0][1]).not.toHaveProperty('accountId');
  });

  it('does not create reauth sessions for successful accounts', async () => {
    const { service, post } = create({ monoAccountId: 'mono', syncStatus: 'SUCCESSFUL' });
    expect((await service.getUserLinkedAccounts('user'))[0].requiresReauthorization).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns the relink action from transaction history without attempting a bank sync', async () => {
    const { service } = create({ monoAccountId: 'mono', syncStatus: 'REAUTHORISATION_REQUIRED' });
    const sync = jest.spyOn(service, 'syncTransactionsForAccount');
    Object.assign(service, { getTransactionsFromDb: jest.fn().mockResolvedValue({ data: [] }) });
    await expect(service.getAllUserTransactions('user')).resolves.toEqual({
      data: [],
      sync: expect.objectContaining({
        status: 'reauthorization_required', requiresReauthorization: true,
        accounts: [{ accountId: 'mono', reauthorizationUrl: 'https://link.mono.co/reauth' }],
      }),
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it('returns the relink action when a webhook arrives during a failed finance refresh', async () => {
    const { service, repo } = create({ monoAccountId: 'mono' });
    Object.assign(service, { financeSyncs: new Map() });
    jest.spyOn(service, 'syncTransactionsForAccount').mockImplementation(async () => {
      repo.find.mockResolvedValue([{ monoAccountId: 'mono', syncStatus: 'REAUTHORISATION_REQUIRED' }]);
      throw new Error('Refresh failed');
    });
    await expect(service.syncUserTransactionsForFinance('user')).resolves.toEqual(expect.objectContaining({
      status: 'reauthorization_required', requiresReauthorization: true,
      accounts: [{ accountId: 'mono', reauthorizationUrl: 'https://link.mono.co/reauth' }],
    }));
  });

  it('rejects reauthorization for accounts the user does not own', async () => {
    const { service, post } = create(null);
    await expect(service.reauthenticateAccount('user', { accountId: 'other' })).rejects.toThrow('Linked Mono account not found');
    expect(post).not.toHaveBeenCalled();
  });

  it('uses the newest saved account status for existing accounts', async () => {
    const syncWebhooks = ['REAUTHORISATION_REQUIRED', 'SUCCESSFUL'].map(sync_status => ({
      body: JSON.stringify({ event: 'mono.events.account_updated', data: { meta: { sync_status } } }),
    }));
    const { service, post } = create({ monoAccountId: 'mono', syncWebhooks });
    expect((await service.getUserLinkedAccounts('user'))[0].requiresReauthorization).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});
