import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import Redis from 'ioredis';
import { Plan } from '../entities/plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { User } from '../../auth/entities/user.entity';
import { PaymentFactoryService } from './payment-factory.service';
import { InitializeSubscriptionDto } from '../dto/subscription.dto';
import * as crypto from 'crypto';
import { SystemSetting } from '../../admin/entities/system-setting.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';
import { PaystackService } from '../providers/paystack.service';
import { StoreBillingCardDto } from '../dto/subscription.dto';
import {
  BANK_ACCOUNT_LIMIT_BY_PLAN,
  normalizePlanSlug,
  PLAN_SLUGS,
  PlanSlug,
} from '../../common/access-control/plan-entitlements';
import { IntegrationPlan } from '../../integrations/entities/integration-plan.entity';
import {
  Integration,
  IntegrationBillingStatus,
} from '../../integrations/entities/integration.entity';
import { REDIS_CLIENT } from '../../common/redis';

const ADDITIONAL_BANK_ACCOUNT_FEE_KEY = 'billing.additional_bank_account_fee';
const ADDITIONAL_BANK_ACCOUNT_FEE_TYPE = 'additional_bank_account_fee';
const INTEGRATION_API_KEY_PAYMENT_TYPE = 'integration_api_key_subscription';
const SCHEDULED_SUBSCRIPTION_LOCK_KEY = 'subscriptions:activation:lock';
const SCHEDULED_SUBSCRIPTION_LOCK_TTL_SECONDS = 55;
const SCHEDULED_SUBSCRIPTION_CHECK_INTERVAL_MS = 60_000;

@Injectable()
export class SubscriptionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionService.name);
  private activationInterval?: NodeJS.Timeout;
  private readonly lockOwner = `subscription-worker-${process.pid}-${Date.now()}`;

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Subscription)
    private readonly subRepository: Repository<Subscription>,
    @InjectRepository(PaymentTransaction)
    private readonly txRepository: Repository<PaymentTransaction>,
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
    @InjectRepository(MonoAccount)
    private readonly monoAccountRepository: Repository<MonoAccount>,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(IntegrationPlan)
    private readonly integrationPlanRepository: Repository<IntegrationPlan>,
    private readonly paymentFactory: PaymentFactoryService,
    private readonly paystackService: PaystackService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    this.activationInterval = setInterval(() => {
      void this.processScheduledSubscriptions();
    }, SCHEDULED_SUBSCRIPTION_CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.activationInterval) {
      clearInterval(this.activationInterval);
    }
  }

  async getAllPlans() {
    return this.planRepository.find({
      where: { isActive: true },
      order: { price: 'ASC' },
    });
  }

  async getUserSubscriptionStatus(userId: string) {
    const sub = await this.activateScheduledSubscriptionIfDue(userId);

    if (!sub) {
      const freePlan = await this.getFallbackBasicPlan();
      return {
        hasActiveSubscription: false,
        activePlan: freePlan || null,
        expiresAt: null,
      };
    }

    const now = new Date();
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
      sub.status = 'past_due';
      await this.subRepository.save(sub);

      const freePlan = await this.getFallbackBasicPlan();
      return {
        hasActiveSubscription: false,
        activePlan: freePlan || null,
        expiresAt: null,
      };
    }

    return {
      hasActiveSubscription: true,
      activePlan: sub.plan,
      expiresAt: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }

  async getBillingHistory(userId: string) {
    const transactions = await this.txRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    return transactions.map((tx) => ({
      id: tx.id,
      amount: Number(tx.amount),
      currency: tx.currency,
      gateway: tx.gateway,
      reference: tx.reference,
      gatewayReference: tx.gatewayReference || undefined,
      status: tx.status,
      paymentMethod: tx.paymentMethod || undefined,
      type: this.getBillingTransactionType(tx),
      description: this.getBillingTransactionDescription(tx),
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    }));
  }

  async getBillingCard(userId: string) {
    const subscription = await this.getLatestSubscription(userId);
    return this.toBillingCardMetadata(subscription);
  }

  async storeBillingCard(userId: string, dto: StoreBillingCardDto) {
    const subscription = await this.getOrCreateSubscriptionForBilling(userId);
    subscription.paymentAuthorization = dto.authorization;
    subscription.gatewayCustomerCode =
      dto.customerCode || subscription.gatewayCustomerCode;
    await this.subRepository.save(subscription);
    return this.toBillingCardMetadata(subscription);
  }

  async changeBillingCard(userId: string, dto: StoreBillingCardDto) {
    const subscription = await this.subRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.plan) {
      throw new BadRequestException('No active subscription found');
    }

    const authorizationCode = dto.authorization?.authorization_code;
    if (!authorizationCode) {
      throw new BadRequestException(
        'A Paystack authorization_code is required to change the billing card',
      );
    }

    if (!subscription.gatewayCustomerCode) {
      subscription.gatewayCustomerCode =
        dto.customerCode || subscription.gatewayCustomerCode;
    }

    if (!subscription.gatewayCustomerCode) {
      throw new BadRequestException(
        'Customer code is required before changing the billing card',
      );
    }

    if (!subscription.plan.gatewayPlanId) {
      throw new BadRequestException(
        'Subscription plan is missing its payment gateway plan mapping',
      );
    }

    if (subscription.gatewaySubscriptionId && subscription.gatewayEmailToken) {
      await this.paystackService.disableSubscription({
        code: subscription.gatewaySubscriptionId,
        token: subscription.gatewayEmailToken,
      });
    }

    const created = await this.paystackService.createSubscription({
      customer: subscription.gatewayCustomerCode,
      plan: subscription.plan.gatewayPlanId,
      authorization: authorizationCode,
    });

    subscription.gatewaySubscriptionId = created.subscriptionCode;
    subscription.gatewayEmailToken = created.emailToken;
    subscription.paymentAuthorization = dto.authorization;
    subscription.cancelAtPeriodEnd = false;
    subscription.canceledAt = null;
    subscription.status = 'active';

    await this.subRepository.save(subscription);
    return this.toBillingCardMetadata(subscription);
  }

  async initializeSubscription(user: User, dto?: InitializeSubscriptionDto) {
    const interval = dto?.interval || 'monthly';
    const requestedSlug = dto?.planSlug || 'solo';
    const planSlug = this.resolveCheckoutPlanSlug(requestedSlug, interval);

    const plan = await this.planRepository.findOne({
      where: { slug: planSlug },
    });

    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (!plan.isActive)
      throw new BadRequestException('Plan is no longer active');
    if (plan.price <= 0)
      throw new BadRequestException(
        'Free plans do not require payment initialization',
      );

    const gatewayName = 'paystack';
    const gateway = this.paymentFactory.getGateway(gatewayName);

    // Ensure plan exists on gateway for recurring billing
    if (!plan.gatewayPlanId) {
      this.logger.log(`Creating missing ${gatewayName} plan for ${plan.name}`);
      const gatewayPlan = await gateway.createPlan({
        name: plan.name,
        amount: plan.price,
        interval: plan.interval,
        currency: plan.currency,
      });
      plan.gatewayPlanId = gatewayPlan.planCode;
      await this.planRepository.save(plan);
      this.logger.log(
        `Plan ${plan.name} registered on ${gatewayName} as ${plan.gatewayPlanId}`,
      );
    }

    const reference = `sub_${crypto.randomBytes(8).toString('hex')}`;
    const gatewayAmount = Math.round(plan.price * 100);

    const tx = this.txRepository.create({
      user,
      amount: plan.price,
      currency: plan.currency,
      gateway: gatewayName,
      reference,
      status: 'pending',
      metadata: { planId: plan.id, type: 'subscription_initialization' },
    });

    await this.txRepository.save(tx);

    const initResponse = await gateway.initializePayment({
      amount: gatewayAmount,
      email: user.email,
      reference,
      metadata: {
        userId: user.id,
        planId: plan.id,
      },
    });

    return {
      authorizationUrl: initResponse.authorizationUrl,
      reference: initResponse.reference,
    };
  }

  async getAdditionalBankAccountFeeStatus(userId: string) {
    const price = await this.getAdditionalBankAccountFee();
    const linkedAccounts = await this.getLinkedBankAccountCount(userId);
    const includedAccounts = await this.getIncludedBankAccountLimit(userId);
    const paidSlots = await this.getPurchasedAdditionalBankAccountSlots(userId);
    const usedPaidSlots = Math.max(linkedAccounts - includedAccounts, 0);

    return {
      price,
      currency: 'NGN',
      freeIncludedAccounts: includedAccounts,
      includedAccounts,
      linkedAccounts,
      paidSlots,
      availableSlots: Math.max(paidSlots - usedPaidSlots, 0),
      paymentRequiredForNextAccount:
        linkedAccounts >= includedAccounts + paidSlots,
    };
  }

  async initializeAdditionalBankAccountCheckout(user: User) {
    if (!user.email) {
      throw new BadRequestException(
        'An email address is required to initialize payment for an additional bank account',
      );
    }

    const status = await this.getAdditionalBankAccountFeeStatus(user.id);
    if (!status.paymentRequiredForNextAccount) {
      throw new BadRequestException(
        'You already have an available paid slot for your next bank account',
      );
    }

    if (status.price <= 0) {
      throw new BadRequestException(
        'Additional bank account pricing has not been configured by an administrator',
      );
    }

    const gatewayName = 'paystack';
    const gateway = this.paymentFactory.getGateway(gatewayName);
    const reference = `aba_${crypto.randomBytes(8).toString('hex')}`;

    const tx = this.txRepository.create({
      user,
      amount: status.price,
      currency: status.currency,
      gateway: gatewayName,
      reference,
      status: 'pending',
      metadata: {
        type: ADDITIONAL_BANK_ACCOUNT_FEE_TYPE,
        slots: 1,
      },
    });

    await this.txRepository.save(tx);

    const initResponse = await gateway.initializePayment({
      amount: Math.round(status.price * 100),
      email: user.email,
      reference,
      metadata: {
        userId: user.id,
        type: ADDITIONAL_BANK_ACCOUNT_FEE_TYPE,
        slots: 1,
      },
    });

    return {
      authorizationUrl: initResponse.authorizationUrl,
      reference: initResponse.reference,
    };
  }

  async assertCanLinkAnotherBankAccount(userId: string): Promise<void> {
    const linkedAccounts = await this.getLinkedBankAccountCount(userId);
    const includedAccounts = await this.getIncludedBankAccountLimit(userId);

    if (linkedAccounts < includedAccounts) {
      return;
    }

    throw new BadRequestException(
      `Your current plan allows ${includedAccounts} linked bank account${includedAccounts === 1 ? '' : 's'}. Upgrade your plan to link another account.`,
    );
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.subRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      throw new BadRequestException('No active subscription found');
    }

    if (subscription.gatewaySubscriptionId && subscription.gatewayEmailToken) {
      await this.paystackService.disableSubscription({
        code: subscription.gatewaySubscriptionId,
        token: subscription.gatewayEmailToken,
      });
    }

    subscription.status = 'canceled';
    subscription.cancelAtPeriodEnd = true;
    subscription.canceledAt = new Date();
    await this.subRepository.save(subscription);

    return {
      success: true,
      status: subscription.status,
      canceledAt: subscription.canceledAt,
    };
  }

  async handleWebhook(
    provider: string,
    payload: any,
    signature?: string,
    rawBody?: Buffer,
  ) {
    const gateway = this.paymentFactory.getGateway(provider);
    const event = await gateway.parseWebhookEvent(payload, signature, rawBody);

    if (!event) return { status: 'ignored', reason: 'Invalid signature' };

    this.logger.log(`Received ${provider} webhook: ${event.event}`);

    if (
      event.event === 'charge.success' ||
      event.event === 'payment_intent.succeeded'
    ) {
      const reference = event.data.reference;
      const tx = await this.txRepository.findOne({
        where: { reference },
        relations: ['user'],
      });

      if (!tx || tx.status === 'success') {
        return { status: 'processed' };
      }

      const verification = await gateway.verifyPayment(reference);

      if (verification.status === 'success') {
        tx.status = 'success';
        tx.gatewayReference = verification.gatewayReference || '';
        tx.paymentMethod = verification.rawResponse?.data?.channel || 'unknown';
        await this.txRepository.save(tx);

        const planId = tx.metadata?.planId;
        if (planId) {
          await this.provisionSubscription(
            tx.user.id,
            planId,
            verification.customerCode,
            verification.rawResponse?.data?.authorization,
          );
        } else if (
          tx.metadata?.type === INTEGRATION_API_KEY_PAYMENT_TYPE &&
          tx.metadata?.integrationId &&
          tx.metadata?.integrationPlanId
        ) {
          await this.activatePaidIntegration(
            tx.metadata.integrationId,
            tx.metadata.integrationPlanId,
          );
        }
      } else {
        tx.status = 'failed';
        await this.txRepository.save(tx);
      }
    }

    return { status: 'success' };
  }

  private async provisionSubscription(
    userId: string,
    planId: string,
    customerCode: string = '',
    authorization?: Record<string, any>,
  ) {
    const plan = await this.planRepository.findOne({ where: { id: planId } });
    const user = await this.subRepository.manager.findOne(User, {
      where: { id: userId },
    });

    if (!plan || !user) return;
    const existingActiveSubscription = await this.subRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    const hasRemainingActiveTime = Boolean(
      existingActiveSubscription?.currentPeriodEnd &&
        existingActiveSubscription.currentPeriodEnd > now,
    );
    const isSamePlanRenewal =
      existingActiveSubscription?.plan?.id === plan.id;

    if (!hasRemainingActiveTime && existingActiveSubscription) {
      existingActiveSubscription.status = 'canceled';
      existingActiveSubscription.canceledAt = now;
      await this.subRepository.save(existingActiveSubscription);
    }

    const startDate = hasRemainingActiveTime
      ? new Date(existingActiveSubscription!.currentPeriodEnd)
      : now;
    const endDate = this.calculatePeriodEnd(startDate, plan.interval);

    let gatewaySubscriptionId = '';
    let gatewayEmailToken = '';
    if (
      plan.gatewayPlanId &&
      customerCode &&
      authorization?.authorization_code
    ) {
      const created = await this.paystackService.createSubscription({
        customer: customerCode,
        plan: plan.gatewayPlanId,
        authorization: authorization.authorization_code,
      });
      gatewaySubscriptionId = created.subscriptionCode;
      gatewayEmailToken = created.emailToken;
    }

    if (hasRemainingActiveTime && existingActiveSubscription && isSamePlanRenewal) {
      existingActiveSubscription.plan = plan;
      existingActiveSubscription.currentPeriodEnd = endDate;
      existingActiveSubscription.gatewaySubscriptionId = gatewaySubscriptionId;
      existingActiveSubscription.gatewayCustomerCode =
        customerCode || existingActiveSubscription.gatewayCustomerCode;
      existingActiveSubscription.gatewayEmailToken = gatewayEmailToken;
      existingActiveSubscription.paymentAuthorization =
        authorization || existingActiveSubscription.paymentAuthorization;
      existingActiveSubscription.cancelAtPeriodEnd = false;
      existingActiveSubscription.canceledAt = null;
      existingActiveSubscription.status = 'active';

      await this.subRepository.save(existingActiveSubscription);
      this.logger.log(
        `Extended plan ${plan.name} for user ${user.id} until ${endDate.toISOString()}`,
      );
      return;
    }

    if (hasRemainingActiveTime && existingActiveSubscription) {
      const scheduledStartDate = new Date(
        existingActiveSubscription.currentPeriodEnd!,
      );
      const scheduledEndDate = this.calculatePeriodEnd(
        scheduledStartDate,
        plan.interval,
      );
      const existingScheduledSubscription = await this.subRepository.findOne({
        where: { user: { id: userId }, status: 'scheduled' },
        relations: ['plan'],
        order: { createdAt: 'DESC' },
      });

      if (existingScheduledSubscription) {
        existingScheduledSubscription.plan = plan;
        existingScheduledSubscription.currentPeriodStart = scheduledStartDate;
        existingScheduledSubscription.currentPeriodEnd = scheduledEndDate;
        existingScheduledSubscription.gatewaySubscriptionId =
          gatewaySubscriptionId;
        existingScheduledSubscription.gatewayCustomerCode =
          customerCode || existingScheduledSubscription.gatewayCustomerCode;
        existingScheduledSubscription.gatewayEmailToken = gatewayEmailToken;
        existingScheduledSubscription.paymentAuthorization =
          authorization || existingScheduledSubscription.paymentAuthorization;
        existingScheduledSubscription.cancelAtPeriodEnd = false;
        existingScheduledSubscription.canceledAt = null;

        await this.subRepository.save(existingScheduledSubscription);
      } else {
        const scheduledSubscription = this.subRepository.create({
          user,
          plan,
          status: 'scheduled',
          currentPeriodStart: scheduledStartDate,
          currentPeriodEnd: scheduledEndDate,
          gatewaySubscriptionId,
          gatewayCustomerCode: customerCode,
          gatewayEmailToken,
          paymentAuthorization: authorization || null,
          cancelAtPeriodEnd: false,
        });

        await this.subRepository.save(scheduledSubscription);
      }

      this.logger.log(
        `Queued plan ${plan.name} for user ${user.id} starting ${scheduledStartDate.toISOString()}`,
      );
      return;
    }

    const sub = this.subRepository.create({
      user,
      plan,
      status: 'active',
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      gatewaySubscriptionId,
      gatewayCustomerCode: customerCode,
      gatewayEmailToken,
      paymentAuthorization: authorization || null,
      cancelAtPeriodEnd: false,
    });

    await this.subRepository.save(sub);
    this.logger.log(`Provisioned plan ${plan.name} for user ${user.id}`);
  }

  private calculatePeriodEnd(startDate: Date, interval: string): Date {
    const endDate = new Date(startDate);

    if (
      interval === 'year' ||
      interval === 'annually' ||
      interval === 'yearly'
    ) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else if (interval === 'month' || interval === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setDate(endDate.getDate() + 30);
    }

    return endDate;
  }

  private async activateScheduledSubscriptionIfDue(
    userId: string,
  ): Promise<Subscription | null> {
    const now = new Date();
    const activeSubscription = await this.subRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (
      activeSubscription &&
      (!activeSubscription.currentPeriodEnd ||
        activeSubscription.currentPeriodEnd >= now)
    ) {
      return activeSubscription;
    }

    if (
      activeSubscription?.currentPeriodEnd &&
      activeSubscription.currentPeriodEnd < now
    ) {
      activeSubscription.status = 'past_due';
      await this.subRepository.save(activeSubscription);
    }

    const scheduledSubscription = await this.subRepository.findOne({
      where: {
        user: { id: userId },
        status: 'scheduled',
        currentPeriodStart: LessThanOrEqual(now),
      },
      relations: ['plan'],
      order: { currentPeriodStart: 'ASC' },
    });

    if (!scheduledSubscription) {
      return null;
    }

    const activatedSubscription = await this.activateScheduledSubscriptionRecord(
      scheduledSubscription.id,
      now,
    );
    return activatedSubscription;
  }

  private async processScheduledSubscriptions(): Promise<void> {
    const lockAcquired = await this.acquireScheduledSubscriptionLock();
    if (!lockAcquired) {
      return;
    }

    try {
      const now = new Date();
      const dueScheduledSubscriptions = await this.subRepository.find({
        where: {
          status: 'scheduled',
          currentPeriodStart: LessThanOrEqual(now),
        },
        relations: ['user', 'plan'],
        order: { currentPeriodStart: 'ASC' },
      });

      for (const scheduledSubscription of dueScheduledSubscriptions) {
        const activeSubscription = await this.subRepository.findOne({
          where: {
            user: { id: scheduledSubscription.user.id },
            status: 'active',
          },
          order: { createdAt: 'DESC' },
        });

        if (
          activeSubscription?.currentPeriodEnd &&
          activeSubscription.currentPeriodEnd > now
        ) {
          continue;
        }

        if (activeSubscription) {
          activeSubscription.status = 'past_due';
          await this.subRepository.save(activeSubscription);
        }

        const activatedSubscription =
          await this.activateScheduledSubscriptionRecord(
            scheduledSubscription.id,
            now,
          );
        if (!activatedSubscription) {
          continue;
        }

        this.logger.log(
          `Activated scheduled plan ${scheduledSubscription.plan.name} for user ${scheduledSubscription.user.id}`,
        );
      }
    } finally {
      await this.releaseScheduledSubscriptionLock();
    }
  }

  private async acquireScheduledSubscriptionLock(): Promise<boolean> {
    const result = await this.redis.set(
      SCHEDULED_SUBSCRIPTION_LOCK_KEY,
      this.lockOwner,
      'EX',
      SCHEDULED_SUBSCRIPTION_LOCK_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  private async releaseScheduledSubscriptionLock(): Promise<void> {
    await this.redis.eval(
      `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        end
        return 0
      `,
      1,
      SCHEDULED_SUBSCRIPTION_LOCK_KEY,
      this.lockOwner,
    );
  }

  private async activateScheduledSubscriptionRecord(
    subscriptionId: string,
    now: Date,
  ): Promise<Subscription | null> {
    const activationResult = await this.subRepository
      .createQueryBuilder()
      .update(Subscription)
      .set({
        status: 'active',
        cancelAtPeriodEnd: false,
        canceledAt: null,
      })
      .where('id = :subscriptionId', { subscriptionId })
      .andWhere('status = :status', { status: 'scheduled' })
      .andWhere('currentPeriodStart <= :now', { now })
      .execute();

    if (!activationResult.affected) {
      return null;
    }

    return this.subRepository.findOne({
      where: { id: subscriptionId },
      relations: ['plan'],
    });
  }

  private async activatePaidIntegration(
    integrationId: string,
    integrationPlanId: string,
  ) {
    const [integration, plan] = await Promise.all([
      this.integrationRepository.findOne({
        where: { id: integrationId },
        relations: ['plan'],
      }),
      this.integrationPlanRepository.findOne({
        where: { id: integrationPlanId },
      }),
    ]);

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

  async updatePlanPrice(planId: string, newPrice: number) {
    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    plan.price = newPrice;
    await this.planRepository.save(plan);
    this.logger.log(`Updated plan ${plan.name} price to ${newPrice}`);

    return plan;
  }

  private async getAdditionalBankAccountFee(): Promise<number> {
    const setting = await this.settingsRepository.findOne({
      where: { key: ADDITIONAL_BANK_ACCOUNT_FEE_KEY },
    });

    const rawValue =
      typeof setting?.value === 'object' && setting?.value !== null
        ? setting.value.amount
        : setting?.value;
    const parsed = Number(rawValue);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async getLinkedBankAccountCount(userId: string): Promise<number> {
    return this.monoAccountRepository.count({
      where: { user: { id: userId } },
    });
  }

  private async getIncludedBankAccountLimit(userId: string): Promise<number> {
    const { activePlan } = await this.getUserSubscriptionStatus(userId);
    const planSlug = normalizePlanSlug(activePlan) || 'starter';
    return BANK_ACCOUNT_LIMIT_BY_PLAN[planSlug];
  }

  private async getFallbackBasicPlan(): Promise<Plan | null> {
    return (
      (await this.planRepository.findOne({ where: { slug: 'starter' } })) ||
      (await this.planRepository.findOne({ where: { slug: 'basic' } })) ||
      (await this.planRepository.findOne({ where: { slug: 'free' } }))
    );
  }

  private resolveCheckoutPlanSlug(
    requestedSlug: PlanSlug,
    interval: 'monthly' | 'annually',
  ): string {
    if (!PLAN_SLUGS.includes(requestedSlug)) {
      throw new BadRequestException('Invalid subscription plan');
    }

    if (interval === 'annually') {
      throw new BadRequestException(
        'Annual billing is not available for the current subscription plans.',
      );
    }

    return requestedSlug;
  }

  private async getPurchasedAdditionalBankAccountSlots(
    userId: string,
  ): Promise<number> {
    const successfulPayments = await this.txRepository.find({
      where: {
        user: { id: userId },
        status: 'success',
      },
    });

    return successfulPayments.reduce((total, tx) => {
      if (tx.metadata?.type !== ADDITIONAL_BANK_ACCOUNT_FEE_TYPE) {
        return total;
      }

      const slots = Number(tx.metadata?.slots ?? 1);
      return total + (Number.isFinite(slots) && slots > 0 ? slots : 1);
    }, 0);
  }

  private getBillingTransactionType(tx: PaymentTransaction): string {
    return tx.metadata?.type || 'payment';
  }

  private getBillingTransactionDescription(tx: PaymentTransaction): string {
    const type = this.getBillingTransactionType(tx);

    if (type === 'subscription_initialization') {
      return 'Subscription Payment';
    }

    if (type === ADDITIONAL_BANK_ACCOUNT_FEE_TYPE) {
      return 'Additional Bank Account Fee';
    }

    return 'Payment';
  }

  private async getLatestSubscription(
    userId: string,
  ): Promise<Subscription | null> {
    return this.subRepository.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  private async getOrCreateSubscriptionForBilling(
    userId: string,
  ): Promise<Subscription> {
    const existing = await this.getLatestSubscription(userId);
    if (existing) {
      return existing;
    }

    const user = await this.subRepository.manager.findOne(User, {
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.subRepository.create({
      user,
      status: 'pending',
      cancelAtPeriodEnd: false,
    });
  }

  private toBillingCardMetadata(subscription: Subscription | null) {
    const authorization = subscription?.paymentAuthorization;
    if (!subscription || !authorization) {
      return { hasBillingCard: false };
    }

    return {
      hasBillingCard: true,
      customerCode: subscription.gatewayCustomerCode || undefined,
      brand: authorization.brand || undefined,
      last4: authorization.last4 || undefined,
      expMonth: authorization.exp_month || undefined,
      expYear: authorization.exp_year || undefined,
      channel: authorization.channel || undefined,
      cardType: authorization.card_type || undefined,
      bank: authorization.bank || undefined,
      reusable: authorization.reusable,
      subscriptionStatus: subscription.status,
    };
  }
}
