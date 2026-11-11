import { AdminUsersController } from './admin-users.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../auth/guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CHECK_POLICIES_KEY } from '../../casl/decorators/check-policies.decorator';
import { Action } from '../../casl/action.enum';

describe('AdminUsersController.exportUsers', () => {
  it('returns the CSV attachment with caching disabled', async () => {
    const service = { exportUsers: jest.fn().mockResolvedValue('csv-data') };
    const controller = new AdminUsersController(
      service as any,
      {} as any,
      {} as any,
    );
    const response = { setHeader: jest.fn() };

    await expect(controller.exportUsers(response as any)).resolves.toBe(
      'csv-data',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="users.csv"',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('requires authentication and the admin manage-all permission', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminUsersController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    const [policy] = Reflect.getMetadata(
      CHECK_POLICIES_KEY,
      AdminUsersController.prototype.exportUsers,
    );
    const ability = { can: jest.fn().mockReturnValue(false) };
    expect(policy(ability)).toBe(false);
    expect(ability.can).toHaveBeenCalledWith(Action.Manage, 'all');
    ability.can.mockReturnValue(true);
    expect(policy(ability)).toBe(true);
  });
});

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
