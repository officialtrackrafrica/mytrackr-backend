import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import axios from 'axios';
import { IntegrationWebhookService } from './integration-webhook.service';
import { publicWebhookAgent } from './integration-url-security';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('./integration-url-security', () => ({
  publicWebhookAgent: jest.fn(),
}));

describe('Signed integration webhook delivery', () => {
  const setup = (
    encrypted: unknown = { encrypted: 'ciphertext' },
    fallback?: string,
  ) => {
    const logRepository = {
      create: jest.fn((value) => ({
        id: 'delivery-log',
        retryCount: 0,
        ...value,
      })),
      save: jest.fn(async (value) => value),
    };
    const integrationRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({
          id: 'integration-one',
          webhookSigningSecret: encrypted,
        }),
    };
    const encryption = {
      decrypt: jest.fn().mockReturnValue('individual-signing-secret'),
    };
    const destroy = jest.fn();
    (publicWebhookAgent as jest.Mock).mockResolvedValue({ destroy });
    (axios.post as jest.Mock).mockResolvedValue({ status: 204 });
    const service = new IntegrationWebhookService(
      logRepository as any,
      new ConfigService({ INTEGRATION_WEBHOOK_SECRET: fallback }),
      integrationRepository as any,
      encryption as any,
    );
    const integration = {
      id: 'integration-one',
      name: 'Store',
      publicKey: 'public',
      platform: 'custom',
      webhookUrl: 'https://store.example/webhook',
      billingStatus: 'active',
      isActive: true,
    } as any;
    return {
      service,
      integration,
      logRepository,
      integrationRepository,
      encryption,
      destroy,
    };
  };
  beforeEach(() => jest.clearAllMocks());

  it('signs the exact body using the individual secret and disables redirects and proxies', async () => {
    const { service, integration, logRepository, encryption, destroy } =
      setup();
    await service.deliver(integration, 'integration.created', {
      name: 'Store',
    });
    const [url, body, options] = (axios.post as jest.Mock).mock.calls[0];
    expect(url).toBe(integration.webhookUrl);
    expect(encryption.decrypt).toHaveBeenCalledWith({
      encrypted: 'ciphertext',
    });
    expect(options.headers['x-mytrackr-signature']).toBe(
      'sha256=' +
        createHmac('sha256', 'individual-signing-secret')
          .update(JSON.stringify(body))
          .digest('hex'),
    );
    expect(options).toMatchObject({
      proxy: false,
      maxRedirects: 0,
      timeout: 10000,
      maxContentLength: 65536,
    });
    expect(logRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'delivered' }),
    );
    expect(destroy).toHaveBeenCalled();
  });

  it('preserves configured signing for legacy integrations', async () => {
    const { service, integration, encryption } = setup(null, 'legacy-secret');
    await service.deliver(integration, 'integration.created', {});
    const [, body, options] = (axios.post as jest.Mock).mock.calls[0];
    expect(options.headers['x-mytrackr-signature']).toBe(
      'sha256=' +
        createHmac('sha256', 'legacy-secret')
          .update(JSON.stringify(body))
          .digest('hex'),
    );
    expect(encryption.decrypt).not.toHaveBeenCalled();
  });

  it('fails closed instead of sending an unsigned webhook', async () => {
    const { service, integration, logRepository } = setup(null);
    await service.deliver(integration, 'integration.created', {});
    expect(axios.post).not.toHaveBeenCalled();
    expect(logRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('records non-success responses as failures and releases the connection agent', async () => {
    const { service, integration, logRepository, destroy } = setup();
    (axios.post as jest.Mock).mockResolvedValue({ status: 302 });
    await service.deliver(integration, 'integration.created', {});
    expect(logRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('302'),
      }),
    );
    expect(destroy).toHaveBeenCalled();
  });

  it('does not connect to a destination rejected by network validation', async () => {
    const { service, integration, logRepository } = setup();
    (publicWebhookAgent as jest.Mock).mockRejectedValue(
      new Error('Private address'),
    );
    await service.deliver(integration, 'integration.created', {});
    expect(axios.post).not.toHaveBeenCalled();
    expect(logRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
