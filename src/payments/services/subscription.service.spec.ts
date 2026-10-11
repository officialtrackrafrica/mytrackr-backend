import { SubscriptionService } from './subscription.service';

describe('SubscriptionService.cancelSubscription', () => {
  const createService = (subscription: any) => {
    const subRepository = {
      findOne: jest.fn().mockResolvedValue(subscription),
      save: jest.fn(async (value) => value),
    };
    const paystackService = {
      disableSubscription: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SubscriptionService(
      {} as any,
      subRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      paystackService as any,
      {} as any,
    );

    return { service, subRepository, paystackService };
  };

  it('disables gateway renewal while keeping access active until period end', async () => {
    const currentPeriodEnd = new Date('2026-11-01T00:00:00.000Z');
    const subscription = {
      id: 'subscription-1',
      status: 'active',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd,
      gatewaySubscriptionId: 'SUB_code',
      gatewayEmailToken: 'email-token',
    };
    const { service, subRepository, paystackService } =
      createService(subscription);

    const result = await service.cancelSubscription('user-1');

    expect(paystackService.disableSubscription).toHaveBeenCalledWith({
      code: 'SUB_code',
      token: 'email-token',
    });
    expect(subscription.status).toBe('active');
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.canceledAt).toBeInstanceOf(Date);
    expect(subRepository.save).toHaveBeenCalledWith(subscription);
    expect(result).toMatchObject({
      success: true,
      subscriptionId: 'subscription-1',
      status: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEnd,
    });
  });

  it('is idempotent when renewal is already disabled', async () => {
    const subscription = {
      id: 'subscription-1',
      status: 'active',
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-10-11T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z'),
      gatewaySubscriptionId: 'SUB_code',
      gatewayEmailToken: 'email-token',
    };
    const { service, subRepository, paystackService } =
      createService(subscription);

    const result = await service.cancelSubscription('user-1');

    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(paystackService.disableSubscription).not.toHaveBeenCalled();
    expect(subRepository.save).not.toHaveBeenCalled();
  });
});
