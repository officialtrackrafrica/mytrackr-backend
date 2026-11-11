import { NotFoundException } from '@nestjs/common';
import { ApiDashboardService } from './dashboard.service';
import { IntegrationPlatform } from '../integrations/entities/integration.entity';

describe('Developer dashboard ownership and credential protection', () => {
  const setup = () => {
    const integrations = {
      findOne: jest.fn(),
      count: jest.fn(),
      find: jest.fn(),
    };
    const webhooks = { findOne: jest.fn() };
    const users = { findOne: jest.fn() };
    const auth = { loginWithEmail: jest.fn(), logoutSession: jest.fn() };
    const security = {
      rateLimit: jest.fn(),
      markSession: jest.fn(),
    };
    const encryption = { verifyPassword: jest.fn().mockResolvedValue(true) };
    const webhookService = {
      retryWebhookLog: jest.fn().mockResolvedValue({ status: 'delivered' }),
    };
    const service = new ApiDashboardService(
      integrations as any,
      {} as any,
      webhooks as any,
      users as any,
      {} as any,
      auth as any,
      encryption as any,
      security as any,
      {} as any,
      {} as any,
      webhookService as any,
      {} as any,
    );
    return {
      service,
      integrations,
      webhooks,
      users,
      auth,
      security,
      webhookService,
    };
  };

  it('scopes integration lookups to the authenticated owner', async () => {
    const { service, integrations } = setup();
    integrations.findOne.mockResolvedValue(null);
    await expect(
      service.owned('owner-one', 'someone-elses-integration'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(integrations.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'someone-elses-integration', user: { id: 'owner-one' } },
        select: expect.not.arrayContaining([
          'apiKeyHash',
          'webhookSigningSecret',
        ]),
      }),
    );
  });

  it('normalizes names and origins, clears optional settings, and rejects blank names', () => {
    const { service } = setup();
    expect(
      service.normalizeIntegration({
        csrf: 'token',
        name: ' Main store ',
        platform: IntegrationPlatform.CUSTOM,
        allowedOrigins: 'https://EXAMPLE.com/, https://example.com',
        webhookUrl: '',
        redirectUrl: '',
      }),
    ).toEqual({
      name: 'Main store',
      platform: 'custom',
      allowedOrigins: ['https://example.com'],
      webhookUrl: '',
      redirectUrl: '',
    });
    expect(() =>
      service.normalizeIntegration({
        csrf: 'token',
        name: ' ',
        platform: IntegrationPlatform.CUSTOM,
      }),
    ).toThrow('name');
  });

  it('revokes the newly created session when the account becomes inactive during sign-in', async () => {
    const { service, users, auth, security } = setup();
    const accessToken = `header.${Buffer.from(JSON.stringify({ sessionId: 'session-one' })).toString('base64url')}.signature`;
    auth.loginWithEmail.mockResolvedValue({
      accessToken,
      refreshToken: 'refresh',
      user: { id: 'owner-one' },
    });
    users.findOne.mockResolvedValue({
      id: 'owner-one',
      isActive: false,
      isVerified: true,
    });
    await expect(
      service.login(
        { csrf: 'csrf', email: 'owner@example.com', password: 'password' },
        {},
      ),
    ).rejects.toThrow('Unable to complete sign-in');
    expect(auth.logoutSession).toHaveBeenCalledWith('session-one');
    expect(security.markSession).not.toHaveBeenCalled();
  });

  it('uses password-only dashboard sign-in even when the account has a legacy MFA flag', async () => {
    const { service, users, auth, security } = setup();
    const accessToken = `header.${Buffer.from(JSON.stringify({ sessionId: 'session-one' })).toString('base64url')}.signature`;
    auth.loginWithEmail.mockResolvedValue({
      accessToken,
      refreshToken: 'refresh',
      user: { id: 'owner-one' },
    });
    users.findOne.mockResolvedValue({
      id: 'owner-one',
      isActive: true,
      isVerified: true,
      securitySettings: { mfaEnabled: true, mfaSecret: 'secret' },
    });
    await expect(
      service.login(
        {
          csrf: 'csrf',
          email: 'owner@example.com',
          password: 'password',
        },
        {},
      ),
    ).resolves.toEqual({ accessToken, refreshToken: 'refresh' });
    expect(security.markSession).toHaveBeenCalledWith(
      'session-one',
      'owner-one',
    );
  });

  it('rejects retries for another integration and never invokes delivery', async () => {
    const { service, integrations, webhooks, webhookService } = setup();
    integrations.findOne.mockResolvedValue({
      id: 'mine',
      isActive: true,
      webhookUrl: 'https://mine.example/hook',
    });
    webhooks.findOne.mockResolvedValue({
      payload: { body: { integration: { id: 'theirs' } } },
    });
    await expect(
      service.retryWebhook('owner-one', 'mine', 'delivery'),
    ).rejects.toThrow('not found');
    expect(webhookService.retryWebhookLog).not.toHaveBeenCalled();
  });

  it.each([
    {
      isActive: false,
      status: 'failed',
      retryCount: 0,
      url: 'https://mine.example/hook',
    },
    {
      isActive: true,
      status: 'delivered',
      retryCount: 0,
      url: 'https://mine.example/hook',
    },
    {
      isActive: true,
      status: 'failed',
      retryCount: 5,
      url: 'https://mine.example/hook',
    },
    {
      isActive: true,
      status: 'failed',
      retryCount: 0,
      url: 'https://old.example/hook',
    },
  ])('rejects unsafe redelivery state %j', async (state) => {
    const { service, integrations, webhooks, webhookService } = setup();
    integrations.findOne.mockResolvedValue({
      id: 'mine',
      isActive: state.isActive,
      webhookUrl: 'https://mine.example/hook',
    });
    webhooks.findOne.mockResolvedValue({
      status: state.status,
      retryCount: state.retryCount,
      payload: { url: state.url, body: { integration: { id: 'mine' } } },
    });
    await expect(
      service.retryWebhook('owner-one', 'mine', 'delivery'),
    ).rejects.toThrow();
    expect(webhookService.retryWebhookLog).not.toHaveBeenCalled();
  });
});
