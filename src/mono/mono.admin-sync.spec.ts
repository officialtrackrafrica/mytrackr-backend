import { NotFoundException } from '@nestjs/common';
import { MonoService, TransactionSyncProcessing } from './mono.service';

describe('Admin user sync test', () => {
  function setup() {
    const accounts = [
      { id: 'local-1', monoAccountId: 'mono-1', lastSyncedAt: new Date(), institutionName: 'Bank One' },
      { id: 'local-2', monoAccountId: 'mono-2', lastSyncedAt: new Date(), institutionName: 'Bank Two' },
    ];
    const repository = { find: jest.fn().mockResolvedValue(accounts) };
    const transactions = {
      count: jest.fn().mockResolvedValue(3),
      findOne: jest.fn().mockResolvedValue({ date: new Date('2026-10-25') }),
    };
    const sync = jest.fn().mockResolvedValue(undefined);
    const project = jest.fn().mockResolvedValue({ synced: 1 });
    const service = Object.assign(Object.create(MonoService.prototype), {
      monoAccountRepository: repository,
      transactionRepository: transactions,
      syncTransactionsForAccount: sync,
      transactionSyncService: { syncAccountTransactions: project },
      logger: { error: jest.fn() },
    }) as MonoService;
    return { service, repository, transactions, sync, project, accounts };
  }

  it('refreshes only the selected user accounts and returns before/after evidence', async () => {
    const { service, repository, sync, project, accounts } = setup();
    const result = await service.testAdminUserSync('selected-user');
    expect(repository.find).toHaveBeenCalledWith({ where: { user: { id: 'selected-user' } } });
    expect(sync).toHaveBeenCalledWith(accounts[0], undefined, false, false, false, true);
    expect(project).toHaveBeenCalledWith('mono-1');
    expect(result.results.map((entry) => entry.status)).toEqual(['completed', 'completed']);
    expect(result.before.accounts[0]).toEqual(expect.objectContaining({ transactionCount: 3, latestTransactionDate: expect.any(Date) }));
    expect(result.after.accounts).toHaveLength(2);
  });

  it('reports processing separately and continues after another account fails', async () => {
    const { service, sync, project } = setup();
    sync.mockRejectedValueOnce(new TransactionSyncProcessing())
      .mockRejectedValueOnce(new Error('Private upstream details'));
    const result = await service.testAdminUserSync('selected-user');
    expect(result.results.map((entry) => entry.status)).toEqual(['processing', 'failed']);
    expect(project).not.toHaveBeenCalled();
    expect(JSON.stringify(result.results)).not.toContain('Private upstream details');
  });

  it('reads status without triggering a refresh', async () => {
    const { service, sync, transactions } = setup();
    await service.getAdminUserSyncStatus('selected-user');
    expect(sync).not.toHaveBeenCalled();
    expect(transactions.count).toHaveBeenCalledWith({ where: { monoAccount: { id: 'local-1' } } });
  });

  it('returns 404 when the selected user has no linked accounts', async () => {
    const { service, repository, sync } = setup();
    repository.find.mockResolvedValue([]);
    await expect(service.testAdminUserSync('missing-user')).rejects.toThrow(NotFoundException);
    expect(sync).not.toHaveBeenCalled();
  });
});
