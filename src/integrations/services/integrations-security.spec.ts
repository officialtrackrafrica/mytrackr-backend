import { createHash } from 'crypto';
import { IntegrationsService } from './integrations.service';

describe('Integration credential lifecycle security', () => {
  const secret = 'mt_sk_original-secret';
  const setup = () => {
    const integration = {
      id: 'integration-one',
      user: { id: 'owner', isActive: true, isVerified: true },
      apiKeyHash: createHash('sha256').update(secret).digest('hex'),
      isActive: true,
      publicKey: 'public',
      allowedOrigins: [],
      business: { id: 'business-one' },
      billingStatus: 'active',
    };
    const integrationRepository = {
      findOne: jest.fn().mockResolvedValue(integration),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => ({ id: 'integration-one', ...value })),
    };
    const encryptionService = {
      encrypt: jest
        .fn()
        .mockReturnValue({
          encrypted: 'cipher',
          iv: 'iv',
          tag: 'tag',
          salt: 'salt',
        }),
    };
    const subscriptionService = { assertUserHasCapability: jest.fn() };
    const service = Object.assign(
      Object.create(IntegrationsService.prototype),
      {
        integrationRepository,
        businessService: {
          getBusinessForUser: jest
            .fn()
            .mockResolvedValue({ id: 'business-one' }),
        },
        subscriptionRepository: {
          findOne: jest
            .fn()
            .mockResolvedValue({
              plan: { slug: 'web', capabilities: { website_linking: true } },
            }),
        },
        subscriptionService,
        integrationWebhookService: { deliver: jest.fn() },
        configService: {
          get: jest.fn().mockReturnValue('https://mytrackr.example'),
        },
        encryptionService,
      },
    ) as IntegrationsService;
    return {
      service,
      integration,
      integrationRepository,
      encryptionService,
      subscriptionService,
    };
  };

  it('stores a key hash and encrypted signing secret while returning fresh credentials once', async () => {
    const { service, integrationRepository, encryptionService } = setup();
    const result = await service.create('owner', {
      name: 'Store',
      platform: 'custom' as any,
    });
    expect(result.apiKey).toMatch(/^mt_sk_/);
    expect(result.webhookSigningSecret).toMatch(/^mt_whsec_/);
    const [stored] = integrationRepository.create.mock.calls[0];
    expect(stored.apiKeyHash).toBe(
      createHash('sha256').update(result.apiKey).digest('hex'),
    );
    expect(stored.webhookSigningSecret).toEqual({
      encrypted: 'cipher',
      iv: 'iv',
      tag: 'tag',
      salt: 'salt',
    });
    expect(encryptionService.encrypt).toHaveBeenCalledWith(
      result.webhookSigningSecret,
    );
    expect(JSON.stringify(stored)).not.toContain(result.webhookSigningSecret);
    expect(JSON.stringify(stored)).not.toContain(result.apiKey);
  });

  it('invalidates the old key permanently on revocation even if an API client later re-enables settings', async () => {
    const { service, integration, integrationRepository } = setup();
    const oldHash = integration.apiKeyHash;
    await service.revoke('owner', integration.id);
    expect(integration.isActive).toBe(false);
    expect(integration.apiKeyHash).not.toBe(oldHash);
    integration.isActive = true;
    await expect(service.authenticateApiKey(secret)).rejects.toThrow(
      'Invalid integration API key',
    );
    expect(integrationRepository.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    { isActive: false, isVerified: true },
    { isActive: true, isVerified: false },
  ])('blocks private API access for an ineligible owner %j', async (state) => {
    const { service, integration, subscriptionService } = setup();
    Object.assign(integration.user, state);
    await expect(service.authenticateApiKey(secret)).rejects.toThrow(
      'inactive or unverified',
    );
    expect(subscriptionService.assertUserHasCapability).not.toHaveBeenCalled();
  });
});
