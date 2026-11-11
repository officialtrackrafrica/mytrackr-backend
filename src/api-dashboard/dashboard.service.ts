import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { User } from '../auth/entities/user.entity';
import { AuthService } from '../auth/services/auth.service';
import { EncryptionService } from '../security/encryption.service';
import { SubscriptionService } from '../payments/services/subscription.service';
import { Integration } from '../integrations/entities/integration.entity';
import { IntegrationEvent } from '../integrations/entities/integration-event.entity';
import { IntegrationsService } from '../integrations/services/integrations.service';
import { IntegrationWebhookService } from '../integrations/services/integration-webhook.service';
import { integrationUrl } from '../integrations/services/integration-url-security';
import { WebhookLog } from '../admin/entities/webhook-log.entity';
import { Business } from '../business/entities/business.entity';
import { REDIS_CLIENT } from '../common/redis';
import { DashboardIntegrationDto, DashboardLoginDto } from './dashboard.dto';
import { DashboardSecurityService } from './dashboard-security.service';

const integrationFields = [
  'id',
  'name',
  'platform',
  'publicKey',
  'apiKeyPrefix',
  'allowedOrigins',
  'redirectUrl',
  'webhookUrl',
  'isActive',
  'billingStatus',
  'currentPeriodEnd',
  'lastUsedAt',
  'createdAt',
  'updatedAt',
] as const;

@Injectable()
export class ApiDashboardService {
  constructor(
    @InjectRepository(Integration)
    private readonly integrations: Repository<Integration>,
    @InjectRepository(IntegrationEvent)
    private readonly events: Repository<IntegrationEvent>,
    @InjectRepository(WebhookLog)
    private readonly webhooks: Repository<WebhookLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
    private readonly auth: AuthService,
    private readonly encryption: EncryptionService,
    private readonly security: DashboardSecurityService,
    private readonly subscriptions: SubscriptionService,
    private readonly integrationService: IntegrationsService,
    private readonly webhookService: IntegrationWebhookService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async login(
    dto: DashboardLoginDto,
    deviceInfo: { ipAddress?: string; userAgent?: string },
  ) {
    await this.security.rateLimit(
      `login:${dto.email.toLowerCase().trim()}`,
      10,
      300,
    );
    const result = await this.auth.loginWithEmail(
      { email: dto.email, password: dto.password },
      deviceInfo,
    );
    if (!result.accessToken || !result.refreshToken || !result.user)
      throw new UnauthorizedException('Unable to complete sign-in.');
    const user = await this.users.findOne({ where: { id: result.user.id } });
    const payload = JSON.parse(
      Buffer.from(result.accessToken.split('.')[1], 'base64url').toString(),
    );
    try {
      if (!user || !user.isActive || !user.isVerified)
        throw new UnauthorizedException('Unable to complete sign-in.');
      await this.security.markSession(payload.sessionId, user.id);
    } catch (error) {
      await this.auth.logoutSession(payload.sessionId);
      throw error;
    }
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  async reauthenticate(userId: string, password: string) {
    await this.security.rateLimit(`sensitive:${userId}`, 5, 300);
    const user = await this.users.findOne({ where: { id: userId } });
    if (
      !user?.isActive ||
      !user.isVerified ||
      !user.passwordHash ||
      (user.securitySettings?.lockoutUntil &&
        new Date(user.securitySettings.lockoutUntil) > new Date()) ||
      !(await this.encryption.verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Password confirmation failed.');
    }
  }

  normalizeIntegration(dto: DashboardIntegrationDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Enter an integration name.');
    const origins = (dto.allowedOrigins || '')
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (origins.length > 20)
      throw new BadRequestException(
        'You can configure up to 20 allowed origins.',
      );
    return {
      name,
      platform: dto.platform,
      allowedOrigins: [
        ...new Set(origins.map((value) => integrationUrl(value, 'origin'))),
      ],
      redirectUrl: dto.redirectUrl?.trim()
        ? integrationUrl(dto.redirectUrl, 'redirect')
        : '',
      webhookUrl: dto.webhookUrl?.trim()
        ? integrationUrl(dto.webhookUrl, 'webhook')
        : '',
    };
  }

  async owned(userId: string, id: string) {
    const integration = await this.integrations.findOne({
      where: { id, user: { id: userId } },
      select: [...integrationFields],
    });
    if (!integration) throw new NotFoundException('Integration not found.');
    return integration;
  }

  async data(
    userId: string,
    section: string,
    page: number,
    integrationId?: string,
  ) {
    const [subscription, business, integrationCount, activeCount] =
      await Promise.all([
        this.subscriptions.getUserSubscriptionStatus(userId),
        this.businesses.findOne({
          where: { userId },
          select: ['id', 'name', 'currency'],
        }),
        this.integrations.count({ where: { user: { id: userId } } }),
        this.integrations.count({
          where: { user: { id: userId }, isActive: true },
        }),
      ]);
    const size = 20;
    const totalPages = Math.max(1, Math.ceil(integrationCount / size));
    const integrationPage =
      section === 'integrations' ? Math.min(page, totalPages) : 1;
    const integrations = await this.integrations.find({
      where: { user: { id: userId } },
      select: [...integrationFields],
      order: { createdAt: 'DESC', id: 'DESC' },
      take: size,
      skip: (integrationPage - 1) * size,
    });
    const selected = integrationId
      ? await this.owned(userId, integrationId)
      : integrations[0] || null;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const eventCount = await this.events.count({ where: { userId } });
    const currencies = await this.events
      .createQueryBuilder('event')
      .select('event.currency', 'currency')
      .addSelect(
        "COALESCE(SUM(CASE WHEN event.event = 'order.paid' THEN event.amount ELSE 0 END), 0)",
        'paid',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN event.event = 'order.refunded' THEN event.amount ELSE 0 END), 0)",
        'refunded',
      )
      .addSelect('COUNT(*)', 'count')
      .where('event.userId = :userId', { userId })
      .andWhere('event.createdAt >= :monthStart', { monthStart })
      .groupBy('event.currency')
      .getRawMany<{
        currency: string;
        paid: string;
        refunded: string;
        count: string;
      }>();

    let records: Array<Record<string, any>> = [];
    let recordCount = 0;
    let recordPage = page;
    if (section === 'events' || section === 'overview') {
      const qb = this.events
        .createQueryBuilder('event')
        .select([
          'event.id',
          'event.integrationId',
          'event.externalId',
          'event.event',
          'event.amount',
          'event.currency',
          'event.occurredAt',
          'event.createdAt',
        ])
        .where('event.userId = :userId', { userId });
      if (section === 'events' && selected)
        qb.andWhere('event.integrationId = :integrationId', {
          integrationId: selected.id,
        });
      recordCount = await qb.getCount();
      recordPage =
        section === 'overview'
          ? 1
          : Math.min(page, Math.max(1, Math.ceil(recordCount / size)));
      records = await qb
        .orderBy('event.createdAt', 'DESC')
        .addOrderBy('event.id', 'DESC')
        .skip((recordPage - 1) * size)
        .take(section === 'overview' ? 6 : size)
        .getMany();
    }
    if (section === 'webhooks' && selected) {
      const qb = this.webhooks
        .createQueryBuilder('delivery')
        .select([
          'delivery.id',
          'delivery.event',
          'delivery.status',
          'delivery.retryCount',
          'delivery.createdAt',
          'delivery.processedAt',
        ])
        .where('delivery.source = :source', { source: 'integrations.outbound' })
        .andWhere(
          "delivery.payload->'body'->'integration'->>'id' = :integrationId",
          { integrationId: selected.id },
        );
      recordCount = await qb.getCount();
      recordPage = Math.min(page, Math.max(1, Math.ceil(recordCount / size)));
      records = await qb
        .orderBy('delivery.createdAt', 'DESC')
        .addOrderBy('delivery.id', 'DESC')
        .skip((recordPage - 1) * size)
        .take(size)
        .getMany();
    }
    const plans =
      section === 'billing'
        ? await this.integrationService.getWebsiteIntegrationPlans()
        : [];
    return {
      subscription,
      business,
      integrations,
      selected,
      integrationCount,
      activeCount,
      eventCount,
      currencies,
      records,
      recordCount,
      recordPage,
      integrationPage,
      totalPages,
      plans,
      size,
    };
  }

  async withMutationLock<T>(
    userId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    // Serialize key changes/settings/creation across tabs and application workers.
    const key = `api-dashboard:mutation:${userId}`;
    const owner = randomUUID();
    if (!(await this.redis.set(key, owner, 'EX', 120, 'NX')))
      throw new BadRequestException(
        'Another integration change is in progress. Please try again shortly.',
      );
    try {
      return await action();
    } finally {
      await this.redis.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
        1,
        key,
        owner,
      );
    }
  }

  async retryWebhook(
    userId: string,
    integrationId: string,
    deliveryId: string,
  ) {
    const integration = await this.owned(userId, integrationId);
    const delivery = await this.webhooks.findOne({
      where: { id: deliveryId, source: 'integrations.outbound' },
    });
    if (!delivery || delivery.payload?.body?.integration?.id !== integration.id)
      throw new NotFoundException('Webhook delivery not found.');
    if (
      !integration.isActive ||
      !integration.webhookUrl ||
      delivery.payload?.url !== integration.webhookUrl
    )
      throw new BadRequestException(
        'Only deliveries to the current endpoint of an enabled integration can be retried.',
      );
    if (delivery.status !== 'failed' || delivery.retryCount >= 5)
      throw new BadRequestException(
        'Only failed deliveries with fewer than five retries can be retried.',
      );
    return this.webhookService.retryWebhookLog(deliveryId);
  }
}

export type DashboardData = Awaited<ReturnType<ApiDashboardService['data']>>;
