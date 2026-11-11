import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Script } from 'node:vm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  ApiDashboardController,
  DashboardPublicController,
} from './dashboard.controller';
import { DashboardAuthGuard } from './dashboard-auth.guard';
import { DashboardSecurityService } from './dashboard-security.service';
import { DashboardExceptionFilter } from './dashboard-exception.filter';
import { ApiDashboardService } from './dashboard.service';
import { AuthService } from '../auth/services/auth.service';
import { SessionService } from '../auth/services/session.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { User } from '../auth/entities/user.entity';
import { TokenBlacklistService, REDIS_CLIENT } from '../common/redis';
import { IntegrationsService } from '../integrations/services/integrations.service';
import { SubscriptionService } from '../payments/services/subscription.service';

const ownerId = '11111111-1111-4111-8111-111111111111';
const integrationId = '22222222-2222-4222-8222-222222222222';
const foreignId = '33333333-3333-4333-8333-333333333333';
const sessionId = 'session-one';
const integration = {
  id: integrationId,
  name: '<img src=x onerror=alert(1)>',
  platform: 'custom',
  publicKey: 'mt_pk_public',
  apiKeyPrefix: 'mt_sk_prefix',
  apiKeyHash: 'HASH_MUST_NOT_RENDER',
  allowedOrigins: ['https://example.com'],
  isActive: true,
  billingStatus: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsedAt: null,
  webhookUrl: '',
  redirectUrl: '',
};
const data = () => ({
  subscription: {
    hasActiveSubscription: true,
    activePlan: {
      name: 'Web',
      slug: 'web',
      capabilities: { website_linking: true },
    },
    expiresAt: new Date(),
  },
  business: { name: 'Example business' },
  integrations: [integration],
  selected: integration,
  integrationCount: 1,
  activeCount: 1,
  eventCount: 0,
  currencies: [],
  records: [],
  recordCount: 0,
  recordPage: 1,
  integrationPage: 1,
  totalPages: 1,
  plans: [],
  size: 20,
});
const csrf = (html: string) => html.match(/name="csrf" value="([^"]+)"/)![1];

describe('Server-rendered developer dashboard HTTP flows', () => {
  let app: INestApplication;
  let security: DashboardSecurityService;
  const state = new Map<string, string>();
  const jwt = new JwtService({ secret: 'dashboard-http-test' });
  const token = () =>
    jwt.sign({ sub: ownerId, sessionId, type: 'access' }, { expiresIn: '15m' });
  const auth = {
    refreshToken: jest.fn(),
    logoutSession: jest.fn().mockResolvedValue(undefined),
  };
  const integrations = {
    create: jest.fn(),
    update: jest.fn(),
    rotateApiKey: jest.fn(),
    revoke: jest.fn(),
    rotateWebhookSigningSecret: jest.fn(),
  };
  const subscriptions = {
    assertUserHasCapability: jest.fn(),
    getUserSubscriptionStatus: jest.fn(),
    initializeSubscription: jest.fn(),
    verifySubscriptionPayment: jest.fn(),
  };
  const dashboard = {
    data: jest.fn(
      async (_owner: string, _section: string, _page: number, id?: string) => {
        if (id === foreignId)
          throw new NotFoundException('Integration not found.');
        return data();
      },
    ),
    login: jest.fn(),
    owned: jest.fn(async (_owner: string, id: string) => {
      if (id === foreignId)
        throw new NotFoundException('Integration not found.');
      return integration;
    }),
    reauthenticate: jest.fn(),
    normalizeIntegration: jest.fn((dto) =>
      ApiDashboardService.prototype.normalizeIntegration.call({} as any, dto),
    ),
    withMutationLock: jest.fn(
      async (_owner: string, action: () => Promise<unknown>) => action(),
    ),
    retryWebhook: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'dashboard-http-test';
    const module = await Test.createTestingModule({
      controllers: [DashboardPublicController, ApiDashboardController],
      providers: [
        DashboardSecurityService,
        DashboardAuthGuard,
        DashboardExceptionFilter,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            JWT_ACCESS_SECRET: 'dashboard-http-test',
            NODE_ENV: 'test',
          }),
        },
        {
          provide: REDIS_CLIENT,
          useValue: {
            get: jest.fn(async (key) => state.get(key) ?? null),
            set: jest.fn(async (key, value, ...options) => {
              if (options.includes('NX') && state.has(key)) return null;
              state.set(key, value);
              return 'OK';
            }),
            del: jest.fn(async (key) => state.delete(key)),
            eval: jest.fn(async () => 1),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: ownerId,
              email: 'owner@example.com',
              isActive: true,
              isVerified: true,
              roles: [],
            }),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSession: jest.fn().mockResolvedValue({ userId: ownerId }),
            updateSessionActivity: jest.fn(),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: { isBlacklisted: jest.fn().mockResolvedValue(false) },
        },
        { provide: AuthService, useValue: auth },
        { provide: ApiDashboardService, useValue: dashboard },
        { provide: IntegrationsService, useValue: integrations },
        { provide: SubscriptionService, useValue: subscriptions },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    security = app.get(DashboardSecurityService);
  });

  beforeEach(() => {
    state.clear();
    jest.clearAllMocks();
    dashboard.login.mockImplementation(async () => {
      await security.markSession(sessionId, ownerId);
      return { accessToken: token(), refreshToken: 'refresh-one' };
    });
    integrations.rotateApiKey.mockResolvedValue({
      id: integrationId,
      apiKey: 'mt_sk_SHOWN_ONCE',
    });
    integrations.create.mockResolvedValue({
      id: integrationId,
      apiKey: 'mt_sk_NEW_ONCE',
      webhookSigningSecret: 'mt_whsec_NEW_ONCE',
    });
    subscriptions.getUserSubscriptionStatus.mockResolvedValue({
      hasActiveSubscription: false,
    });
    subscriptions.initializeSubscription.mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.com/valid',
    });
    auth.refreshToken.mockResolvedValue({
      accessToken: token(),
      refreshToken: 'refresh-two',
    });
  });
  afterAll(async () => app?.close());

  const login = async () => {
    const agent = request.agent(app.getHttpServer());
    const page = await agent.get('/api/dashboard/login').expect(200);
    await agent
      .post('/api/dashboard/login')
      .type('form')
      .send({
        csrf: csrf(page.text),
        email: 'owner@example.com',
        password: 'password',
      })
      .expect(303)
      .expect('Location', '/api/dashboard');
    return agent;
  };

  it('redirects unauthenticated visitors to sign-in, including visitors with main-app bearer tokens', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${token()}`)
      .expect(303)
      .expect('Location', '/api/dashboard/login');
  });

  it('serves a styled sign-in page and rejects login without a valid CSRF token', async () => {
    const page = await request(app.getHttpServer())
      .get('/api/dashboard/login')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect('Cache-Control', /no-store/);
    expect(page.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.text).toContain('/api/dashboard/assets/dashboard.css');
    expect(page.text).toContain('/developers/assets/mytrackr-logo.png');
    expect(page.text).not.toContain('name="otp"');
    await request(app.getHttpServer())
      .post('/api/dashboard/login')
      .type('form')
      .send({
        csrf: 'forged',
        email: 'owner@example.com',
        password: 'password',
      })
      .expect(403);
    expect(dashboard.login).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get('/api/dashboard/assets/dashboard.css')
      .expect(200)
      .expect('Content-Type', /css/);
  });

  it.each([
    '',
    '/integrations',
    '/keys',
    '/settings',
    '/events',
    '/webhooks',
    '/billing',
    '/docs',
  ])(
    'renders protected dashboard page %s and escapes customer values',
    async (section) => {
      const agent = await login();
      const page = await agent
        .get('/api/dashboard' + section)
        .expect(200)
        .expect('Content-Type', /html/)
        .expect('Cache-Control', /no-store/);
      expect(page.text).not.toContain('HASH_MUST_NOT_RENDER');
      expect(page.text).not.toContain('<img src=x onerror=alert(1)>');
      expect(page.text).not.toContain('mt_sk_SHOWN_ONCE');
      for (const script of page.text.matchAll(
        /<script nonce="[^"]+">([\s\S]*?)<\/script>/g,
      ))
        expect(() => new Script(script[1])).not.toThrow();
    },
  );

  it('enforces ownership for pages and mutations', async () => {
    const agent = await login();
    await agent
      .get(`/api/dashboard/keys?integrationId=${foreignId}`)
      .expect(404);
    const page = await agent.get('/api/dashboard/keys').expect(200);
    await agent
      .post(`/api/dashboard/integrations/${foreignId}/rotate-key`)
      .type('form')
      .send({
        csrf: csrf(page.text),
        password: 'password',
        confirmation: 'confirm',
      })
      .expect(404);
    expect(integrations.rotateApiKey).not.toHaveBeenCalled();
  });

  it('shows a rotated key once, rejects resubmission, and requires password confirmation', async () => {
    const agent = await login();
    const page = await agent.get('/api/dashboard/keys').expect(200);
    const form = {
      csrf: csrf(page.text),
      password: 'password',
      confirmation: 'confirm',
    };
    const result = await agent
      .post(`/api/dashboard/integrations/${integrationId}/rotate-key`)
      .type('form')
      .send(form)
      .expect(201);
    expect(result.text).toContain('mt_sk_SHOWN_ONCE');
    expect(result.headers['cache-control']).toContain('no-store');
    expect(dashboard.reauthenticate).toHaveBeenCalledWith(ownerId, 'password');
    await agent
      .post(`/api/dashboard/integrations/${integrationId}/rotate-key`)
      .type('form')
      .send(form)
      .expect(409);
    const refreshed = await agent.get('/api/dashboard/keys').expect(200);
    expect(refreshed.text).not.toContain('mt_sk_SHOWN_ONCE');
    expect(integrations.rotateApiKey).toHaveBeenCalledTimes(1);
    await agent
      .post(`/api/dashboard/integrations/${integrationId}/rotate-key`)
      .type('form')
      .send({ csrf: csrf(refreshed.text), confirmation: 'confirm' })
      .expect(400);
  });

  it('creates an integration and reveals API and signing secrets only in that response', async () => {
    const agent = await login();
    const page = await agent.get('/api/dashboard/integrations').expect(200);
    const result = await agent
      .post('/api/dashboard/integrations')
      .type('form')
      .send({ csrf: csrf(page.text), name: 'New site', platform: 'custom' })
      .expect(201);
    expect(result.text).toContain('mt_sk_NEW_ONCE');
    expect(result.text).toContain('mt_whsec_NEW_ONCE');
    const next = await agent.get('/api/dashboard/keys').expect(200);
    expect(next.text).not.toContain('mt_sk_NEW_ONCE');
    expect(next.text).not.toContain('mt_whsec_NEW_ONCE');
  });

  it('rejects invalid IDs, pagination, extra fields and cross-site mutations', async () => {
    const agent = await login();
    await agent.get('/api/dashboard/keys?integrationId=invalid').expect(400);
    await agent.get('/api/dashboard/events?page=-1').expect(400);
    const page = await agent.get('/api/dashboard/integrations').expect(200);
    const form = {
      csrf: csrf(page.text),
      name: 'New site',
      platform: 'custom',
    };
    await agent
      .post('/api/dashboard/integrations')
      .type('form')
      .send({ ...form, userId: foreignId })
      .expect(400);
    await agent
      .post('/api/dashboard/integrations')
      .set('Sec-Fetch-Site', 'cross-site')
      .type('form')
      .send(form)
      .expect(403);
    expect(integrations.create).not.toHaveBeenCalled();
  });

  it('refreshes an expired access cookie through the existing session service', async () => {
    await security.markSession(sessionId, ownerId);
    await request(app.getHttpServer())
      .get('/api/dashboard')
      .set(
        'Cookie',
        'apiDashboardAccess=expired; apiDashboardRefresh=refresh-one',
      )
      .expect(200);
    expect(auth.refreshToken).toHaveBeenCalledWith({
      refreshToken: 'refresh-one',
    });
  });

  it('blocks payment redirects to untrusted hosts', async () => {
    const agent = await login();
    const page = await agent.get('/api/dashboard/billing').expect(200);
    subscriptions.initializeSubscription.mockResolvedValueOnce({
      authorizationUrl: 'https://evil.example/checkout',
    });
    await agent
      .post('/api/dashboard/checkout')
      .type('form')
      .send({ csrf: csrf(page.text), planSlug: 'web' })
      .expect(400);
  });

  it('revokes its own session and clears dashboard cookies on logout', async () => {
    const agent = await login();
    const page = await agent.get('/api/dashboard').expect(200);
    await agent
      .post('/api/dashboard/logout')
      .type('form')
      .send({ csrf: csrf(page.text) })
      .expect(303)
      .expect('Location', '/api/dashboard/login');
    expect(auth.logoutSession).toHaveBeenCalledWith(sessionId);
    expect(await security.hasSession(sessionId, ownerId)).toBe(false);
    await agent.get('/api/dashboard').expect(303);
  });
});
