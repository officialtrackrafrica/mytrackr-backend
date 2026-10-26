import { AsyncLocalStorage } from 'node:async_hooks';
import { MonoService, TransactionSyncProcessing } from './mono.service';

describe('Admin raw Mono responses', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['mono.accounts.jobs.update', { account: 'account-1', id: 'job-1', status: 'finished' }],
    ['mono.events.account_updated', { account: { _id: 'account-1' }, meta: { sync_status: 'SUCCESSFUL' } }],
  ])('saves the exact authenticated %s payload for its account', async (event, data) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = Object.assign(Object.create(MonoService.prototype), {
      monoAccountRepository: { query },
    }) as MonoService;
    const payload = { event, data };
    const raw = JSON.stringify(payload, null, 3) + '\n';
    await service.recordSyncWebhook(payload, Buffer.from(raw));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 20'), [
      expect.any(String), 'account-1',
    ]);
    expect(JSON.parse(query.mock.calls[0][1][0])[0]).toEqual({
      event, body: raw, receivedAt: expect.any(String),
    });
  });

  it('preserves the exact body and job headers even when refresh is processing', async () => {
    const body = '{\n  "status": "successful", "data": []\n}\n';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'x-job-status': 'processing', 'x-job-id': 'job-123' },
    }));
    const service = Object.assign(Object.create(MonoService.prototype), {
      monoResponseCapture: new AsyncLocalStorage(),
      baseUrl: 'https://api.withmono.com/v2',
      configService: { get: () => 'secret-not-for-display' },
      monoAccountRepository: { update: jest.fn().mockResolvedValue({}) },
    }) as MonoService;

    const result = await service.withMonoResponses(async () => {
      await expect((service as any).monoGet('/accounts/account-1/transactions', {
        'x-realtime': 'true',
      })).rejects.toBeInstanceOf(TransactionSyncProcessing);
      return { results: [] };
    });

    expect(result.monoResponses).toEqual([expect.objectContaining({
      body,
      status: 200,
      headers: expect.objectContaining({ 'x-job-id': 'job-123' }),
    })]);
    expect(JSON.stringify(result)).not.toContain('secret-not-for-display');
  });
});
