import { ServiceUnavailableException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { InstitutionService } from '../../mono/institution.service';

describe('Subscription checkout bank coverage', () => {
  let service: SubscriptionService;
  let gateway: any;
  let factory: any;
  let transactions: any;
  let institutions: InstitutionService;
  let selectedBank: any;

  const setup = (slug = 'solo') => {
    const plans = {
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
    { institutionId: 'bank-1', accountType: 'BUSINESS_BANKING' },
    { institutionId: 'unknown', accountType: 'PERSONAL_BANKING' },
  ])(
    'temporarily allows checkout without validating bank selections',
    async (dto) => {
      await expect(
        service.initializeSubscription(user, dto),
      ).resolves.toMatchObject({ authorizationUrl: 'https://checkout.example' });
      expect(institutions.getSupportedInstitutions).not.toHaveBeenCalled();
      expect(gateway.initializePayment).toHaveBeenCalled();
      expect(transactions.save).toHaveBeenCalled();
    },
  );

  it('does not let a Mono outage block checkout while selection is disabled', async () => {
    jest
      .spyOn(institutions, 'getSupportedInstitutions')
      .mockRejectedValue(new ServiceUnavailableException());
    await expect(
      service.initializeSubscription(user, selectedBank),
    ).resolves.toMatchObject({ authorizationUrl: 'https://checkout.example' });
    expect(institutions.getSupportedInstitutions).not.toHaveBeenCalled();
    expect(gateway.initializePayment).toHaveBeenCalled();
    expect(transactions.save).toHaveBeenCalled();
  });

  it('does not mark an unchecked bank selection as validated in payment metadata', async () => {
    const result = await service.initializeSubscription(user, {
      institutionId: 'bank-1',
      accountType: 'PERSONAL_BANKING',
    });
    expect(result.authorizationUrl).toBe('https://checkout.example');
    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectedBank: undefined }),
      }),
    );
    expect(gateway.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectedBank: undefined }),
      }),
    );
  });

  it.each(['starter', 'web', 'solo', 'duo', 'unlimited'])(
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
});
