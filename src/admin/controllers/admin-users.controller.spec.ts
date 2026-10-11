import { AdminUsersController } from './admin-users.controller';

describe('AdminUsersController.cancelSubscription', () => {
  it('disables renewal for the selected user and writes an audit log', async () => {
    const currentPeriodEnd = new Date('2026-11-01T00:00:00.000Z');
    const result = {
      success: true,
      subscriptionId: 'subscription-1',
      status: 'active',
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-10-11T00:00:00.000Z'),
      currentPeriodEnd,
    };
    const subscriptionService = {
      cancelSubscription: jest.fn().mockResolvedValue(result),
    };
    const auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AdminUsersController(
      {} as any,
      auditService as any,
      subscriptionService as any,
    );
    const request = {
      user: { id: 'admin-1' },
      ip: '127.0.0.1',
    };

    await expect(
      controller.cancelSubscription('user-1', request),
    ).resolves.toBe(result);
    expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith(
      'user-1',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      'USER_SUBSCRIPTION_AUTO_RENEW_DISABLED_BY_ADMIN',
      'Subscription',
      'subscription-1',
      'admin-1',
      { userId: 'user-1', currentPeriodEnd },
      '127.0.0.1',
    );
  });
});
