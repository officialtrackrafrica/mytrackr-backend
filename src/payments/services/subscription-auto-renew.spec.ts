import { SubscriptionService } from './subscription.service';
import { InitializeSubscriptionDto } from '../dto/subscription.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('Subscription renewal mode', () => {
  const plan = {
    id: 'plan-1',
    name: 'Solo',
    interval: 'monthly',
    gatewayPlanId: 'PLN_1',
  };
  const setup = (active: any = null, scheduled: any = null) => {
    const subscriptions = {
      find: jest.fn().mockResolvedValue([active, scheduled].filter(Boolean)),
      manager: { findOne: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      findOne: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(where.status === 'scheduled' ? scheduled : active),
        ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const paystack = {
      createSubscription: jest.fn().mockResolvedValue({
        subscriptionCode: 'SUB_new',
        emailToken: 'token',
      }),
      disableSubscription: jest.fn().mockResolvedValue(undefined),
      findSubscriptionForCustomerPlan: jest.fn().mockResolvedValue(null),
      fetchSubscription: jest
        .fn()
        .mockResolvedValue({ email_token: 'recovered-token' }),
    };
    const service = new SubscriptionService(
      { findOne: jest.fn().mockResolvedValue(plan) } as any,
      subscriptions as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      paystack as any,
      {} as any,
      {} as any,
    );
    const provision = (
      metadata: any = { autoRenew: false },
      authorization: any = { authorization_code: 'AUTH_1', reusable: true },
    ) =>
      (service as any).provisionSubscription(
        'user-1',
        plan.id,
        'CUS_1',
        authorization,
        {},
        metadata,
      );
    return { service, subscriptions, paystack, provision };
  };
  const existing = (overrides = {}) => ({
    id: 'sub-1',
    plan,
    status: 'active',
    autoRenew: true,
    cancelAtPeriodEnd: false,
    gatewaySubscriptionId: 'SUB_old',
    gatewayEmailToken: 'old-token',
    currentPeriodStart: new Date('2026-11-01'),
    currentPeriodEnd: new Date('2026-12-01'),
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it.each([null, { authorization_code: 'AUTH_1', reusable: true }])(
    'grants one paid period without creating recurring billing (%j)',
    async (authorization) => {
      const { provision, subscriptions, paystack } = setup();
      await provision({ autoRenew: false }, authorization);
      expect(paystack.createSubscription).not.toHaveBeenCalled();
      expect(subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          autoRenew: false,
          status: 'active',
          gatewaySubscriptionId: '',
          currentPeriodEnd: new Date('2026-12-12T12:00:00Z'),
        }),
      );
    },
  );

  it.each([{}, { autoRenew: true }])(
    'preserves automatic billing for legacy/default requests %j',
    async (metadata) => {
      const { provision, subscriptions, paystack } = setup();
      await provision(metadata);
      expect(paystack.createSubscription).toHaveBeenCalled();
      expect(subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          autoRenew: true,
          gatewaySubscriptionId: 'SUB_new',
        }),
      );
    },
  );

  it('disables existing automatic charges and extends same-plan paid access', async () => {
    const active = existing();
    const { provision, paystack } = setup(active);
    await provision();
    expect(paystack.disableSubscription).toHaveBeenCalledWith({
      code: 'SUB_old',
      token: 'old-token',
    });
    expect(paystack.createSubscription).not.toHaveBeenCalled();
    expect(active).toMatchObject({
      autoRenew: false,
      status: 'active',
      gatewaySubscriptionId: '',
      currentPeriodEnd: new Date('2027-01-01'),
    });
  });

  it('keeps automatic billing disabled on a manual prorated upgrade', async () => {
    const { provision, paystack, subscriptions } = setup(
      existing({ plan: { ...plan, id: 'old-plan' } }),
    );
    await provision({ autoRenew: false, isProratedUpgrade: true });
    expect(paystack.disableSubscription).toHaveBeenCalledTimes(1);
    expect(paystack.createSubscription).not.toHaveBeenCalled();
    expect(subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        autoRenew: false,
        status: 'active',
        gatewaySubscriptionId: '',
      }),
    );
  });

  it('disables active and scheduled automatic charges when replacing a scheduled plan', async () => {
    const active = existing({ plan: { ...plan, id: 'old-plan' } });
    const scheduled = existing({
      id: 'scheduled',
      status: 'scheduled',
      gatewaySubscriptionId: 'SUB_scheduled',
    });
    const { provision, paystack } = setup(active, scheduled);
    await provision();
    expect(paystack.disableSubscription).toHaveBeenCalledTimes(2);
    expect(scheduled).toMatchObject({
      autoRenew: false,
      status: 'scheduled',
      gatewaySubscriptionId: '',
      currentPeriodStart: active.currentPeriodEnd,
    });
  });

  it('propagates cancellation errors so payment fulfilment can retry', async () => {
    const active = existing();
    const { provision, paystack, subscriptions } = setup(active);
    paystack.disableSubscription.mockRejectedValue(
      new Error('gateway unavailable'),
    );
    await expect(provision()).rejects.toThrow('gateway unavailable');
    expect(active.autoRenew).toBe(true);
    expect(subscriptions.save).not.toHaveBeenCalled();
  });

  it('recovers a missing cancellation token', async () => {
    const { provision, paystack } = setup(existing({ gatewayEmailToken: '' }));
    await provision();
    expect(paystack.disableSubscription).toHaveBeenCalledWith({
      code: 'SUB_old',
      token: 'recovered-token',
    });
  });

  it('propagates gateway lookup failures instead of silently leaving automatic charges enabled', async () => {
    const { provision, paystack } = setup(
      existing({ gatewaySubscriptionId: '', gatewayCustomerCode: 'CUS_1' }),
    );
    paystack.findSubscriptionForCustomerPlan.mockRejectedValue(
      new Error('lookup unavailable'),
    );
    await expect(provision()).rejects.toThrow('lookup unavailable');
    expect(paystack.createSubscription).not.toHaveBeenCalled();
  });

  it('allows a manual subscriber to opt back into automatic billing', async () => {
    const active = existing({
      autoRenew: false,
      gatewaySubscriptionId: '',
      gatewayEmailToken: '',
    });
    const { provision, paystack } = setup(active);
    await provision({ autoRenew: true });
    expect(paystack.disableSubscription).not.toHaveBeenCalled();
    expect(active).toMatchObject({
      autoRenew: true,
      gatewaySubscriptionId: 'SUB_new',
    });
  });

  it('stops queued automatic charges even when renewing the current plan', async () => {
    const active = existing();
    const scheduled = existing({
      id: 'queued',
      status: 'scheduled',
      gatewaySubscriptionId: 'SUB_queued',
    });
    const { provision, paystack } = setup(active, scheduled);
    await provision();
    expect(paystack.disableSubscription).toHaveBeenCalledWith({
      code: 'SUB_queued',
      token: 'old-token',
    });
    expect(scheduled.autoRenew).toBe(false);
  });

  it('prevents card-update flows from creating automatic billing for manual subscribers', async () => {
    const { service, paystack } = setup();
    await expect(
      (service as any).ensurePaystackSubscriptionCode({ autoRenew: false }),
    ).rejects.toThrow('One-time subscriptions');
    expect(paystack.createSubscription).not.toHaveBeenCalled();
  });

  it.each([false, true, undefined, 'false', 0])(
    'validates autoRenew as a JSON boolean (%j)',
    async (autoRenew) => {
      const dto = plainToInstance(InitializeSubscriptionDto, { autoRenew });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'autoRenew')).toBe(
        autoRenew !== undefined && typeof autoRenew !== 'boolean',
      );
    },
  );
});

describe.each(['callback', 'webhook'])(
  'Manual payment confirmation through %s',
  (source) => {
    const setup = () => {
      const tx = {
        reference: 'ref',
        gateway: 'paystack',
        status: 'pending',
        user: { id: 'user-1' },
        metadata: { planId: 'plan-1', autoRenew: false },
      };
      const transactions = {
        findOne: jest.fn(async () => ({ ...tx })),
        save: jest.fn(async (value) => {
          Object.assign(tx, value);
          return value;
        }),
      };
      const gateway = {
        verifyPayment: jest
          .fn()
          .mockResolvedValue({
            status: 'success',
            reference: 'ref',
            customerCode: 'CUS_1',
            rawResponse: { data: { channel: 'bank_transfer' } },
          }),
        parseWebhookEvent: jest
          .fn()
          .mockResolvedValue({
            event: 'charge.success',
            data: { reference: 'ref' },
          }),
      };
      const service = new SubscriptionService(
        {} as any,
        {} as any,
        transactions as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { getGateway: () => gateway } as any,
        {} as any,
        {} as any,
        {} as any,
      );
      const provision = jest
        .spyOn(service as any, 'provisionSubscription')
        .mockImplementation(async () => {
          expect(transactions.save).not.toHaveBeenCalled();
        });
      jest
        .spyOn(service, 'getUserSubscriptionStatus')
        .mockResolvedValue({ hasActiveSubscription: true } as any);
      const confirm = () =>
        source === 'callback'
          ? service.verifySubscriptionPayment('user-1', 'ref')
          : service.handleWebhook('paystack', {}, 'signature');
      return { confirm, provision, transactions, tx };
    };

    it('passes the stored mode to provisioning and ignores repeated successful confirmations', async () => {
      const { confirm, provision, transactions } = setup();
      await confirm();
      expect(provision).toHaveBeenCalledWith(
        'user-1',
        'plan-1',
        'CUS_1',
        undefined,
        expect.any(Object),
        { planId: 'plan-1', autoRenew: false },
      );
      expect(transactions.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
      );
      await confirm();
      expect(provision).toHaveBeenCalledTimes(1);
    });

    it('does not mark fulfilment successful if disabling old automatic billing fails', async () => {
      const { confirm, provision, transactions, tx } = setup();
      provision.mockRejectedValueOnce(new Error('cancellation unavailable'));
      await expect(confirm()).rejects.toThrow('cancellation unavailable');
      expect(transactions.save).not.toHaveBeenCalled();
      expect(tx.status).toBe('pending');
      await confirm();
      expect(tx.status).toBe('success');
    });
  },
);
