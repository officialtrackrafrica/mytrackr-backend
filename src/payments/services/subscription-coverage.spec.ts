import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { InstitutionService } from '../../mono/institution.service';

describe('Subscription checkout bank coverage', () => {
  let service: SubscriptionService;
  let gateway: any;
  let factory: any;
  let transactions: any;
  let institutions: InstitutionService;
  let selectedBank: any;
  let plans: any;

  const setup = (slug = 'solo') => {
    plans = {
      findOne: jest.fn().mockResolvedValue({
        id: 'plan-1',
        slug,
        name: slug,
        price: 5000,
        currency: 'NGN',
        interval: 'monthly',
        isActive: true,
        gatewayPlanId: 'PLN_1',
      }),
    };
    gateway = {
      initializePayment: jest.fn().mockResolvedValue({
        authorizationUrl: 'https://checkout.example',
        reference: 'ref',
      }),
    };
    factory = { getGateway: jest.fn().mockReturnValue(gateway) };
    transactions = { create: jest.fn((value) => value), save: jest.fn() };
    institutions = new InstitutionService({ get: () => 'secret' } as any);
    selectedBank = {
      institutionId: 'bank-1',
      name: 'Example Bank',
      accountType: 'PERSONAL_BANKING',
      authMethods: ['internet_banking'],
    };
    jest
      .spyOn(institutions, 'getSupportedInstitutions')
      .mockResolvedValue([selectedBank]);
    service = new SubscriptionService(
      plans as any,
      {} as any,
      transactions,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      factory,
      {} as any,
      {} as any,
      institutions,
    );
    jest
      .spyOn(service as any, 'calculateSubscriptionCheckoutPricing')
      .mockResolvedValue({
        amountDue: 5000,
        fullPlanPrice: 5000,
        proratedCredit: 0,
        remainingDays: 0,
        currentPlanDailyPrice: 0,
        isProratedUpgrade: false,
      });
  };
  const user = { id: 'user-1', email: 'user@example.com' } as any;

  beforeEach(() => setup());
  afterEach(() => jest.restoreAllMocks());

  it.each([
    undefined,
    {},
    { institutionId: 'bank-1' },
    { accountType: 'PERSONAL_BANKING' },
    { institutionId: 'bank-1', accountType: 'BUSINESS_BANKING' },
    { institutionId: 'unknown', accountType: 'PERSONAL_BANKING' },
  ])(
    'rejects checkout with missing or unsupported bank selections %j',
    async (dto) => {
      await expect(
        service.initializeSubscription(user, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.initializePayment).not.toHaveBeenCalled();
      expect(transactions.create).not.toHaveBeenCalled();
      expect(transactions.save).not.toHaveBeenCalled();
    },
  );

  it('blocks checkout when Mono coverage cannot be checked', async () => {
    jest
      .spyOn(institutions, 'getSupportedInstitutions')
      .mockRejectedValue(new ServiceUnavailableException());
    await expect(
      service.initializeSubscription(user, selectedBank),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(institutions.getSupportedInstitutions).toHaveBeenCalled();
    expect(gateway.initializePayment).not.toHaveBeenCalled();
    expect(transactions.create).not.toHaveBeenCalled();
    expect(transactions.save).not.toHaveBeenCalled();
  });

  it('stores the validated bank selection in transaction and gateway metadata', async () => {
    const result = await service.initializeSubscription(user, {
      institutionId: 'bank-1',
      accountType: 'PERSONAL_BANKING',
    });
    expect(result.authorizationUrl).toBe('https://checkout.example');
    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectedBank }),
      }),
    );
    expect(gateway.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectedBank }),
      }),
    );
  });

  it.each(['starter', 'web'])(
    'allows %s checkout without bank selection',
    async (slug) => {
      setup(slug);
      await expect(
        service.initializeSubscription(user, { planSlug: slug } as any),
      ).resolves.toMatchObject({
        authorizationUrl: 'https://checkout.example',
      });
      expect(institutions.getSupportedInstitutions).not.toHaveBeenCalled();
    },
  );

  it.each(['solo', 'duo', 'unlimited'])(
    'requires a supported bank selection for %s checkout',
    async (slug) => {
      setup(slug);
      await expect(
        service.initializeSubscription(user, { planSlug: slug } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.initializePayment).not.toHaveBeenCalled();

      await expect(
        service.initializeSubscription(user, {
          planSlug: slug,
          ...selectedBank,
        }),
      ).resolves.toMatchObject({
        authorizationUrl: 'https://checkout.example',
      });
      expect(institutions.getSupportedInstitutions).toHaveBeenCalled();
    },
  );

  it.each([undefined, true, false])(
    'passes autoRenew=%s through checkout with bank declaration',
    async (autoRenew) => {
      const result = await service.initializeSubscription(user, {
        ...selectedBank,
        autoRenew,
      });
      const expected = autoRenew !== false;
      expect(result.autoRenew).toBe(expected);
      expect(transactions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            autoRenew: expected,
            selectedBank,
          }),
        }),
      );
      expect(gateway.initializePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: expected ? 'PLN_1' : undefined,
          channels: expected ? undefined : [],
          metadata: expect.objectContaining({
            autoRenew: expected,
            selectedBank,
          }),
        }),
      );
    },
  );

  it('does not require or create a gateway billing plan for a one-time payment', async () => {
    plans.findOne.mockResolvedValue({
      id: 'plan-1',
      slug: 'solo',
      price: 5000,
      currency: 'NGN',
      interval: 'monthly',
      isActive: true,
    });
    gateway.createPlan = jest.fn();
    await expect(
      service.initializeSubscription(user, {
        ...selectedBank,
        autoRenew: false,
      }),
    ).resolves.toMatchObject({ autoRenew: false });
    expect(gateway.createPlan).not.toHaveBeenCalled();
  });
});
