import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { In, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { BusinessService } from '../../business/services/business.service';
import { EncryptionService } from '../../security/encryption.service';
import {
  CategorySource,
  Transaction,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { PaymentTransaction } from '../../payments/entities/payment-transaction.entity';
import { Plan } from '../../payments/entities/plan.entity';
import { Subscription } from '../../payments/entities/subscription.entity';
import { PaymentFactoryService } from '../../payments/services/payment-factory.service';
import { SubscriptionService } from '../../payments/services/subscription.service';
import { normalizePlanSlug } from '../../common/access-control/plan-entitlements';
import { IntegrationWebhookService } from './integration-webhook.service';
import {
  CreateIntegrationEventDto,
  IntegrationMetricsQueryDto,
} from '../dto/integration-event.dto';
import {
  ConnectPaystackDto,
  SyncPaystackDto,
} from '../dto/paystack-connection.dto';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
} from '../dto/integration.dto';
import { IntegrationPlan } from '../entities/integration-plan.entity';
import {
  IntegrationEvent,
  IntegrationEventItem,
  IntegrationEventType,
} from '../entities/integration-event.entity';
import { PaystackConnection } from '../entities/paystack-connection.entity';
import {
  Integration,
  IntegrationBillingStatus,
} from '../entities/integration.entity';

const WEBSITE_INTEGRATION_ALLOWED_PLAN_SLUGS = new Set([
  'web',
  'solo',
  'duo',
  'unlimited',
]);

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(IntegrationPlan)
    private readonly integrationPlanRepository: Repository<IntegrationPlan>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepository: Repository<PaymentTransaction>,
    @InjectRepository(IntegrationEvent)
    private readonly eventRepository: Repository<IntegrationEvent>,
    @InjectRepository(IntegrationEventItem)
    private readonly eventItemRepository: Repository<IntegrationEventItem>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(PaystackConnection)
    private readonly paystackConnectionRepository: Repository<PaystackConnection>,
    private readonly businessService: BusinessService,
    private readonly paymentFactory: PaymentFactoryService,
    private readonly subscriptionService: SubscriptionService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly integrationWebhookService: IntegrationWebhookService,
  ) {}

  async getWebsiteIntegrationPlans() {
    return this.planRepository.find({
      where: {
        isActive: true,
        slug: In([...WEBSITE_INTEGRATION_ALLOWED_PLAN_SLUGS]),
      },
      order: { price: 'ASC' },
    });
  }

  async create(userId: string, dto: CreateIntegrationDto) {
    const business = await this.businessService.getBusinessForUser(userId);
    const appSubscription = await this.getWebsiteIntegrationSubscription(userId);
    const apiKey = this.generateSecretKey();
    const { planSlug: _deprecatedPlanSlug, ...integrationDto } = dto;
    const integration = this.integrationRepository.create({
      ...integrationDto,
      user: { id: userId } as any,
      business,
      plan: null,
      publicKey: this.generatePublicKey(),
      apiKeyPrefix: apiKey.slice(0, 16),
      apiKeyHash: this.hashApiKey(apiKey),
      allowedOrigins: dto.allowedOrigins || [],
      isActive: true,
      billingStatus: IntegrationBillingStatus.ACTIVE,
      currentPeriodEnd: appSubscription.currentPeriodEnd || null,
    });

    const saved = await this.integrationRepository.save(integration);
    await this.integrationWebhookService.deliver(
      saved,
      'integration.created',
      {
        allowedOrigins: saved.allowedOrigins,
        redirectUrl: saved.redirectUrl || null,
        webhookUrl: saved.webhookUrl || null,
      },
    );
    return {
      ...this.toResponse(saved),
      apiKey,
    };
  }

  async list(userId: string) {
    const integrations = await this.integrationRepository.find({
      where: { user: { id: userId } },
      relations: ['business', 'plan'],
      order: { createdAt: 'DESC' },
    });
    return integrations.map((integration) => this.toResponse(integration));
  }

  async update(userId: string, id: string, dto: UpdateIntegrationDto) {
    const integration = await this.findOwnedIntegration(userId, id);
    Object.assign(integration, dto);
    const saved = await this.integrationRepository.save(integration);
    await this.integrationWebhookService.deliver(
      saved,
      'integration.updated',
      {
        updatedFields: Object.keys(dto),
        allowedOrigins: saved.allowedOrigins,
        redirectUrl: saved.redirectUrl || null,
        webhookUrl: saved.webhookUrl || null,
        isActive: saved.isActive,
      },
    );
    return this.toResponse(saved);
  }

  async rotateApiKey(userId: string, id: string) {
    const integration = await this.findOwnedIntegration(userId, id);
    if (integration.billingStatus !== IntegrationBillingStatus.ACTIVE) {
      throw new BadRequestException(
        'Pay for this API-key plan before rotating the key',
      );
    }

    const apiKey = this.generateSecretKey();
    integration.apiKeyPrefix = apiKey.slice(0, 16);
    integration.apiKeyHash = this.hashApiKey(apiKey);
    const saved = await this.integrationRepository.save(integration);
    return {
      ...this.toResponse(saved),
      apiKey,
    };
  }

  async revoke(userId: string, id: string) {
    const integration = await this.findOwnedIntegration(userId, id);
    integration.isActive = false;
    const saved = await this.integrationRepository.save(integration);
    await this.integrationWebhookService.deliver(
      saved,
      'integration.revoked',
      {
        revokedAt: new Date().toISOString(),
      },
    );
    return { message: 'Integration revoked' };
  }

  async getPublicConfig(publicKey: string, origin?: string) {
    const integration = await this.integrationRepository.findOne({
      where: { publicKey, isActive: true },
      relations: ['business'],
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    this.assertOriginAllowed(integration, origin);

    return {
      publicKey: integration.publicKey,
      name: integration.name,
      platform: integration.platform,
      businessName: integration.business.name,
      connectUrl: this.buildConnectUrl(integration),
      allowedOrigins: integration.allowedOrigins,
      features: {
        pricing: true,
        accountLinking: true,
        ocrUpload: true,
      },
      billingStatus: integration.billingStatus,
    };
  }

  async initializeCheckout(userId: string, id: string) {
    const integration = await this.findOwnedIntegration(userId, id);

    const subscription = await this.subscriptionRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
    const normalizedPlanSlug = normalizePlanSlug(subscription?.plan);
    const hasEligibleSubscription = Boolean(
      subscription?.plan &&
        (!subscription.currentPeriodEnd ||
          subscription.currentPeriodEnd >= new Date()) &&
        normalizedPlanSlug &&
        WEBSITE_INTEGRATION_ALLOWED_PLAN_SLUGS.has(normalizedPlanSlug),
    );

    if (hasEligibleSubscription) {
      return {
        hasActiveSubscription: true,
        message: `You already have an active ${subscription!.plan.name} subscription with website integration access.`,
        plan: subscription!.plan,
        authorizationUrl: null,
        reference: null,
      };
    }

    const checkout = await this.subscriptionService.initializeSubscription(
      integration.user,
      { planSlug: 'web', interval: 'monthly' },
    );

    return {
      hasActiveSubscription: false,
      message:
        'A Web subscription is required for website integrations. Complete payment to activate access.',
      targetPlanSlug: 'web',
      ...checkout,
    };
  }

  async authenticateApiKey(apiKey: string) {
    if (!apiKey?.startsWith('mt_sk_')) {
      throw new ForbiddenException('Invalid integration API key');
    }

    const prefix = apiKey.slice(0, 16);
    const integration = await this.integrationRepository.findOne({
      where: { apiKeyPrefix: prefix, isActive: true },
      relations: ['business', 'user', 'plan'],
    });

    if (!integration || !this.apiKeyMatches(apiKey, integration.apiKeyHash)) {
      throw new ForbiddenException('Invalid integration API key');
    }

    if (integration.billingStatus !== IntegrationBillingStatus.ACTIVE) {
      throw new ForbiddenException(
        'This integration API key is not active. Complete payment first.',
      );
    }

    if (
      integration.currentPeriodEnd &&
      integration.currentPeriodEnd < new Date()
    ) {
      integration.billingStatus = IntegrationBillingStatus.PAST_DUE;
      await this.integrationRepository.save(integration);
      throw new ForbiddenException('This integration API-key plan is past due');
    }

    integration.lastUsedAt = new Date();
    await this.integrationRepository.save(integration);
    return integration;
  }

  async getPrivateConfig(integration: Integration) {
    const plans = await this.planRepository.find({
      where: { isActive: true },
      order: { price: 'ASC' },
    });

    return {
      integration: this.toResponse(integration),
      business: {
        id: integration.business.id,
        name: integration.business.name,
        currency: integration.business.currency,
      },
      plans,
    };
  }

  async ingestEvent(integration: Integration, dto: CreateIntegrationEventDto) {
    const existing = await this.eventRepository.findOne({
      where: {
        integrationId: integration.id,
        externalId: dto.externalId,
      },
      relations: ['items'],
    });

    if (existing) {
      return {
        id: existing.id,
        externalId: existing.externalId,
        duplicate: true,
      };
    }

    const event = this.eventRepository.create({
      integration,
      integrationId: integration.id,
      business: integration.business,
      businessId: integration.business.id,
      user: integration.user,
      userId: integration.user.id,
      event: dto.event,
      externalId: dto.externalId,
      orderId: dto.orderId,
      amount: dto.amount,
      taxAmount: dto.taxAmount || 0,
      paymentFee: dto.paymentFee || 0,
      currency: dto.currency || integration.business.currency || 'NGN',
      paymentProvider: dto.paymentProvider,
      customerEmail: dto.customer?.email?.toLowerCase(),
      customerName: dto.customer?.name,
      occurredAt: new Date(dto.occurredAt),
      metadata: dto.metadata || null,
      items: (dto.items || []).map((item) =>
        this.eventItemRepository.create({
          productId: item.productId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total ?? item.quantity * item.unitPrice,
        }),
      ),
    });

    const saved = await this.eventRepository.save(event);
    await this.mirrorFinanceTransactions(integration, saved);
    await this.integrationWebhookService.deliver(
      integration,
      'integration.event.received',
      {
        id: saved.id,
        event: saved.event,
        externalId: saved.externalId,
        orderId: saved.orderId || null,
        amount: Number(saved.amount),
        currency: saved.currency,
        paymentProvider: saved.paymentProvider || null,
        occurredAt: saved.occurredAt.toISOString(),
        customer: {
          email: saved.customerEmail || null,
          name: saved.customerName || null,
        },
      },
    );

    return {
      id: saved.id,
      externalId: saved.externalId,
      duplicate: false,
    };
  }

  async getMetrics(
    integration: Integration,
    query: IntegrationMetricsQueryDto,
  ) {
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = query.endDate ? new Date(query.endDate) : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid metrics date range');
    }

    const events = await this.eventRepository.find({
      where: {
        integrationId: integration.id,
      },
      relations: ['items'],
      order: { occurredAt: 'ASC' },
    });

    const scoped = events.filter((event) => {
      const occurredAt = new Date(event.occurredAt);
      return occurredAt >= start && occurredAt <= end;
    });

    const paidEvents = scoped.filter(
      (event) => event.event === IntegrationEventType.ORDER_PAID,
    );
    const refundEvents = scoped.filter(
      (event) => event.event === IntegrationEventType.ORDER_REFUNDED,
    );
    const failedEvents = scoped.filter(
      (event) => event.event === IntegrationEventType.PAYMENT_FAILED,
    );

    const grossSales = this.sum(paidEvents.map((event) => event.amount));
    const refunds = this.sum(refundEvents.map((event) => event.amount));
    const paymentFees = this.sum(paidEvents.map((event) => event.paymentFee));
    const taxableSales = this.sum(paidEvents.map((event) => event.taxAmount));
    const netSales = grossSales - refunds - paymentFees;
    const customerEmails = paidEvents
      .map((event) => event.customerEmail)
      .filter(Boolean) as string[];
    const uniqueCustomers = new Set(customerEmails);

    return {
      period: { start, end },
      grossSales,
      successfulPaymentInflow: grossSales,
      refunds,
      netSales,
      orderCount: paidEvents.length,
      averageOrderValue:
        paidEvents.length > 0
          ? Number((grossSales / paidEvents.length).toFixed(2))
          : 0,
      revenueByDay: this.revenueByPeriod(paidEvents, 'day'),
      revenueByWeek: this.revenueByPeriod(paidEvents, 'week'),
      revenueByMonth: this.revenueByPeriod(paidEvents, 'month'),
      revenueByProduct: this.revenueByProduct(paidEvents),
      revenueByCategory: this.revenueByCategory(paidEvents),
      customerCount: uniqueCustomers.size,
      repeatCustomerCount: this.repeatCustomerCount(customerEmails),
      failedPayments: {
        count: failedEvents.length,
        amount: this.sum(failedEvents.map((event) => event.amount)),
      },
      taxableSales,
      paymentFees,
    };
  }

  async connectPaystack(
    userId: string,
    integrationId: string,
    dto: ConnectPaystackDto,
  ) {
    const integration = await this.findOwnedIntegration(userId, integrationId);

    if (
      !dto.secretKey.startsWith('sk_live_') &&
      !dto.secretKey.startsWith('sk_test_')
    ) {
      throw new BadRequestException('A valid Paystack secret key is required');
    }

    const metadata = await this.fetchPaystackMetadata(dto.secretKey);
    let connection = await this.paystackConnectionRepository.findOne({
      where: { integrationId: integration.id },
    });

    if (!connection) {
      connection = this.paystackConnectionRepository.create({
        integration,
        integrationId: integration.id,
      });
    }

    connection.encryptedSecretKey = this.encryptionService.encrypt(
      dto.secretKey,
    );
    connection.keyLast4 = dto.secretKey.slice(-4);
    connection.businessName = metadata.businessName;
    connection.businessEmail = metadata.businessEmail;
    connection.country = metadata.country;
    connection.isActive = true;
    connection.lastSyncError = null;

    const saved = await this.paystackConnectionRepository.save(connection);
    await this.integrationWebhookService.deliver(
      integration,
      'integration.paystack.connected',
      {
        connectionId: saved.id,
        keyPreview: saved.keyLast4 ? `****${saved.keyLast4}` : null,
        businessName: saved.businessName || null,
        businessEmail: saved.businessEmail || null,
        country: saved.country || null,
      },
    );
    return this.toPaystackConnectionResponse(saved);
  }

  async getPaystackConnection(userId: string, integrationId: string) {
    const integration = await this.findOwnedIntegration(userId, integrationId);
    const connection = await this.paystackConnectionRepository.findOne({
      where: { integrationId: integration.id },
    });

    if (!connection) {
      throw new NotFoundException('Paystack connection not found');
    }

    return this.toPaystackConnectionResponse(connection);
  }

  async disconnectPaystack(userId: string, integrationId: string) {
    const integration = await this.findOwnedIntegration(userId, integrationId);
    const connection = await this.paystackConnectionRepository.findOne({
      where: { integrationId: integration.id },
    });

    if (!connection) {
      throw new NotFoundException('Paystack connection not found');
    }

    connection.isActive = false;
    await this.paystackConnectionRepository.save(connection);
    await this.integrationWebhookService.deliver(
      integration,
      'integration.paystack.disconnected',
      {
        connectionId: connection.id,
        disconnectedAt: new Date().toISOString(),
      },
    );
    return { message: 'Paystack connection disconnected' };
  }

  async syncPaystackTransactions(
    userId: string,
    integrationId: string,
    dto: SyncPaystackDto,
  ) {
    const integration = await this.findOwnedIntegration(userId, integrationId);
    const connection = await this.paystackConnectionRepository.findOne({
      where: { integrationId: integration.id, isActive: true },
    });

    if (!connection) {
      throw new NotFoundException('Active Paystack connection not found');
    }

    const secretKey = this.encryptionService.decrypt(
      connection.encryptedSecretKey,
    );
    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : connection.lastSyncedAt ||
        new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid Paystack sync date range');
    }

    try {
      const transactions = await this.fetchPaystackTransactions(
        secretKey,
        startDate,
        endDate,
      );
      const refunds = await this.fetchPaystackRefunds(
        secretKey,
        startDate,
        endDate,
      );

      let imported = 0;
      let skipped = 0;

      for (const tx of transactions) {
        if (tx.status === 'success') {
          const result = await this.ingestEvent(integration, {
            event: IntegrationEventType.ORDER_PAID,
            externalId: `paystack_charge_${tx.id || tx.reference}`,
            orderId: tx.reference,
            amount: Number(tx.amount || 0) / 100,
            currency: tx.currency || integration.business.currency || 'NGN',
            paymentFee: Number(tx.fees || 0) / 100,
            paymentProvider: 'paystack',
            occurredAt: tx.paid_at || tx.created_at,
            customer: {
              email: tx.customer?.email,
              name:
                `${tx.customer?.first_name || ''} ${tx.customer?.last_name || ''}`.trim() ||
                undefined,
            },
            metadata: {
              source: 'paystack_direct_sync',
              reference: tx.reference,
              channel: tx.channel,
              authorization: tx.authorization
                ? {
                    brand: tx.authorization.brand,
                    cardType: tx.authorization.card_type,
                    bank: tx.authorization.bank,
                  }
                : undefined,
            },
          });
          result.duplicate ? skipped++ : imported++;
        } else if (tx.status === 'failed') {
          const result = await this.ingestEvent(integration, {
            event: IntegrationEventType.PAYMENT_FAILED,
            externalId: `paystack_failed_${tx.id || tx.reference}`,
            orderId: tx.reference,
            amount: Number(tx.amount || 0) / 100,
            currency: tx.currency || integration.business.currency || 'NGN',
            paymentProvider: 'paystack',
            occurredAt: tx.created_at,
            customer: { email: tx.customer?.email },
            metadata: {
              source: 'paystack_direct_sync',
              reference: tx.reference,
              gatewayResponse: tx.gateway_response,
            },
          });
          result.duplicate ? skipped++ : imported++;
        }
      }

      for (const refund of refunds) {
        const result = await this.ingestEvent(integration, {
          event: IntegrationEventType.ORDER_REFUNDED,
          externalId: `paystack_refund_${refund.id || refund.transaction?.reference}`,
          orderId: refund.transaction?.reference,
          amount: Number(refund.amount || 0) / 100,
          currency:
            refund.currency ||
            refund.transaction?.currency ||
            integration.business.currency ||
            'NGN',
          paymentProvider: 'paystack',
          occurredAt: refund.created_at || refund.processed_at,
          customer: {
            email: refund.transaction?.customer?.email,
          },
          metadata: {
            source: 'paystack_direct_sync',
            refundStatus: refund.status,
            transactionReference: refund.transaction?.reference,
          },
        });
        result.duplicate ? skipped++ : imported++;
      }

      connection.lastSyncedAt = endDate;
      connection.lastSuccessfulSyncAt = new Date();
      connection.lastSyncError = null;
      await this.paystackConnectionRepository.save(connection);

      const result = {
        imported,
        skipped,
        fetched: transactions.length + refunds.length,
        fetchedTransactions: transactions.length,
        fetchedRefunds: refunds.length,
        connection: this.toPaystackConnectionResponse(connection),
      };

      await this.integrationWebhookService.deliver(
        integration,
        'integration.paystack.sync.completed',
        {
          imported,
          skipped,
          fetched: result.fetched,
          fetchedTransactions: transactions.length,
          fetchedRefunds: refunds.length,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          connectionId: connection.id,
        },
      );

      return result;
    } catch (error) {
      connection.lastSyncError =
        error instanceof Error ? error.message : 'Paystack sync failed';
      await this.paystackConnectionRepository.save(connection);
      await this.integrationWebhookService.deliver(
        integration,
        'integration.paystack.sync.failed',
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          connectionId: connection.id,
          error:
            error instanceof Error ? error.message : 'Paystack sync failed',
        },
      );
      throw error;
    }
  }

  async activatePaidIntegration(integrationId: string, planId: string) {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId },
      relations: ['plan'],
    });
    const plan = await this.integrationPlanRepository.findOne({
      where: { id: planId },
    });

    if (!integration || !plan) {
      return;
    }

    const periodEnd = new Date();
    if (plan.interval === 'annually' || plan.interval === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    integration.plan = plan;
    integration.billingStatus = IntegrationBillingStatus.ACTIVE;
    integration.currentPeriodEnd = periodEnd;
    integration.isActive = true;
    await this.integrationRepository.save(integration);
  }

  private async findOwnedIntegration(userId: string, id: string) {
    const integration = await this.integrationRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['business', 'plan', 'user'],
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  private async mirrorFinanceTransactions(
    integration: Integration,
    event: IntegrationEvent,
  ) {
    if (event.event === IntegrationEventType.ORDER_PAID) {
      await this.saveFinanceTransaction(integration, {
        externalId: `integration:${event.integrationId}:${event.externalId}:revenue`,
        amount: event.amount,
        direction: TransactionDirection.CREDIT,
        description: `Website sale${event.orderId ? ` ${event.orderId}` : ''}`,
        date: event.occurredAt,
        category: 'INCOME',
      });

      if (Number(event.paymentFee) > 0) {
        await this.saveFinanceTransaction(integration, {
          externalId: `integration:${event.integrationId}:${event.externalId}:fee`,
          amount: Number(event.paymentFee),
          direction: TransactionDirection.DEBIT,
          description: `Payment fee${event.orderId ? ` ${event.orderId}` : ''}`,
          date: event.occurredAt,
          category: 'EXPENSE',
          subCategory: 'Payment Fees',
        });
      }
    }

    if (event.event === IntegrationEventType.ORDER_REFUNDED) {
      await this.saveFinanceTransaction(integration, {
        externalId: `integration:${event.integrationId}:${event.externalId}:refund`,
        amount: event.amount,
        direction: TransactionDirection.DEBIT,
        description: `Website refund${event.orderId ? ` ${event.orderId}` : ''}`,
        date: event.occurredAt,
        category: 'INCOME',
        subCategory: 'Refunds',
      });
    }
  }

  private async fetchPaystackMetadata(secretKey: string) {
    const data = await this.paystackGet(secretKey, '/integration');
    return {
      businessName: data?.business_name || data?.name,
      businessEmail: data?.business_email || data?.email,
      country: data?.country,
    };
  }

  private async fetchPaystackTransactions(
    secretKey: string,
    startDate: Date,
    endDate: Date,
  ) {
    const all: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const query = new URLSearchParams({
        perPage: String(perPage),
        page: String(page),
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      });
      const data = await this.paystackGet(secretKey, `/transaction?${query}`);
      const rows = Array.isArray(data) ? data : [];
      all.push(...rows);

      if (rows.length < perPage) {
        break;
      }
      page += 1;
    }

    return all;
  }

  private async fetchPaystackRefunds(
    secretKey: string,
    startDate: Date,
    endDate: Date,
  ) {
    const all: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const query = new URLSearchParams({
        perPage: String(perPage),
        page: String(page),
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      });
      const data = await this.paystackGet(secretKey, `/refund?${query}`);
      const rows = Array.isArray(data) ? data : [];
      all.push(...rows);

      if (rows.length < perPage) {
        break;
      }
      page += 1;
    }

    return all;
  }

  private async paystackGet(secretKey: string, path: string) {
    const response = await fetch(`https://api.paystack.co${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
    });
    const body = await response.json();

    if (!response.ok || !body.status) {
      throw new BadRequestException(body.message || 'Paystack request failed');
    }

    return body.data;
  }

  private toPaystackConnectionResponse(connection: PaystackConnection) {
    return {
      id: connection.id,
      integrationId: connection.integrationId,
      keyPreview: `****${connection.keyLast4}`,
      businessName: connection.businessName || undefined,
      businessEmail: connection.businessEmail || undefined,
      country: connection.country || undefined,
      isActive: connection.isActive,
      lastSyncedAt: connection.lastSyncedAt,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
      lastSyncError: connection.lastSyncError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private async saveFinanceTransaction(
    integration: Integration,
    dto: {
      externalId: string;
      amount: number;
      direction: TransactionDirection;
      description: string;
      date: Date;
      category: string;
      subCategory?: string;
    },
  ) {
    const existing = await this.transactionRepository.findOne({
      where: { externalId: dto.externalId },
    });

    if (existing) {
      return;
    }

    const tx = this.transactionRepository.create({
      externalId: dto.externalId,
      name: integration.name,
      amount: dto.amount,
      direction: dto.direction,
      description: dto.description,
      date: dto.date,
      businessId: integration.business.id,
      userId: integration.user.id,
      category: dto.category,
      subCategory: dto.subCategory,
      manualCategory: dto.category,
      manualSubCategory: dto.subCategory,
      categorySource: CategorySource.MANUAL,
      isCategorised: true,
    });

    await this.transactionRepository.save(tx);
  }

  private sum(values: Array<number | string>) {
    return Number(
      values
        .reduce<number>((total, value) => total + Number(value || 0), 0)
        .toFixed(2),
    );
  }

  private revenueByPeriod(
    events: IntegrationEvent[],
    period: 'day' | 'week' | 'month',
  ) {
    const rows = new Map<
      string,
      { period: string; revenue: number; orders: number }
    >();

    for (const event of events) {
      const key = this.periodKey(new Date(event.occurredAt), period);
      const row = rows.get(key) || { period: key, revenue: 0, orders: 0 };
      row.revenue += Number(event.amount);
      row.orders += 1;
      rows.set(key, row);
    }

    return Array.from(rows.values()).map((row) => ({
      ...row,
      revenue: Number(row.revenue.toFixed(2)),
    }));
  }

  private revenueByProduct(events: IntegrationEvent[]) {
    const rows = new Map<
      string,
      { productId?: string; name: string; revenue: number; quantity: number }
    >();

    for (const event of events) {
      for (const item of event.items || []) {
        const key = item.productId || item.name;
        const row = rows.get(key) || {
          productId: item.productId || undefined,
          name: item.name,
          revenue: 0,
          quantity: 0,
        };
        row.revenue += Number(item.total);
        row.quantity += Number(item.quantity);
        rows.set(key, row);
      }
    }

    return Array.from(rows.values())
      .map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  private revenueByCategory(events: IntegrationEvent[]) {
    const rows = new Map<
      string,
      { category: string; revenue: number; quantity: number }
    >();

    for (const event of events) {
      for (const item of event.items || []) {
        const key = item.category || 'Uncategorised';
        const row = rows.get(key) || { category: key, revenue: 0, quantity: 0 };
        row.revenue += Number(item.total);
        row.quantity += Number(item.quantity);
        rows.set(key, row);
      }
    }

    return Array.from(rows.values())
      .map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  private repeatCustomerCount(customerEmails: string[]) {
    const counts = new Map<string, number>();
    for (const email of customerEmails) {
      counts.set(email, (counts.get(email) || 0) + 1);
    }
    return Array.from(counts.values()).filter((count) => count > 1).length;
  }

  private periodKey(date: Date, period: 'day' | 'week' | 'month') {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');

    if (period === 'month') {
      return `${year}-${month}`;
    }

    if (period === 'week') {
      const start = new Date(
        Date.UTC(year, date.getUTCMonth(), date.getUTCDate()),
      );
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
      return start.toISOString().split('T')[0];
    }

    return `${year}-${month}-${day}`;
  }

  private assertOriginAllowed(integration: Integration, origin?: string) {
    if (!origin || integration.allowedOrigins.length === 0) {
      return;
    }

    if (!integration.allowedOrigins.includes(origin)) {
      throw new BadRequestException(
        'Origin is not allowed for this integration',
      );
    }
  }

  private toResponse(integration: Integration) {
    return {
      id: integration.id,
      name: integration.name,
      platform: integration.platform,
      publicKey: integration.publicKey,
      apiKeyPrefix: integration.apiKeyPrefix,
      plan: integration.plan
        ? {
            id: integration.plan.id,
            name: integration.plan.name,
            slug: integration.plan.slug,
            price: Number(integration.plan.price),
            currency: integration.plan.currency,
            interval: integration.plan.interval,
            monthlyRequestLimit: integration.plan.monthlyRequestLimit,
          }
        : undefined,
      billingStatus: integration.billingStatus,
      currentPeriodEnd: integration.currentPeriodEnd,
      allowedOrigins: integration.allowedOrigins,
      redirectUrl: integration.redirectUrl || undefined,
      webhookUrl: integration.webhookUrl || undefined,
      connectUrl: this.buildConnectUrl(integration),
      isActive: integration.isActive,
      lastUsedAt: integration.lastUsedAt,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  private buildConnectUrl(integration: Integration) {
    const appUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:3000';
    const url = new URL('/integrations/connect', appUrl);
    url.searchParams.set('client', integration.publicKey);

    if (integration.redirectUrl) {
      url.searchParams.set('redirect', integration.redirectUrl);
    }

    return url.toString();
  }

  private generatePublicKey() {
    return `mt_pk_${randomBytes(16).toString('hex')}`;
  }

  private generateSecretKey() {
    return `mt_sk_${randomBytes(32).toString('hex')}`;
  }

  private async findActivePlanBySlug(slug: string) {
    const plan = await this.integrationPlanRepository.findOne({
      where: { slug, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException('Integration API-key pricing plan not found');
    }

    return plan;
  }

  private async getWebsiteIntegrationSubscription(userId: string) {
    const subscription = await this.subscriptionRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription?.plan) {
      throw new ForbiddenException(
        'Website integrations require an active Web, Solo, Duo, or Unlimited subscription plan.',
      );
    }

    if (
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd < new Date()
    ) {
      throw new ForbiddenException(
        'Your subscription has expired. Renew an eligible plan to use website integrations.',
      );
    }

    const normalizedPlanSlug = normalizePlanSlug(subscription.plan);
    if (
      !normalizedPlanSlug ||
      !WEBSITE_INTEGRATION_ALLOWED_PLAN_SLUGS.has(normalizedPlanSlug)
    ) {
      throw new ForbiddenException(
        'Website integrations require a Web, Solo, Duo, or Unlimited subscription plan.',
      );
    }

    return subscription;
  }

  private hashApiKey(apiKey: string) {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private apiKeyMatches(apiKey: string, hash: string) {
    const candidate = Buffer.from(this.hashApiKey(apiKey));
    const stored = Buffer.from(hash);

    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
  }
}
