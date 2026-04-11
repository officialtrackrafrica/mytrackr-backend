import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

const ADDITIONAL_BANK_ACCOUNT_FEE_KEY =
  'billing.additional_bank_account_fee';
const ADDITIONAL_BANK_ACCOUNT_FEE_TYPE = 'additional_bank_account_fee';
const FREE_INCLUDED_BANK_ACCOUNTS = 1;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

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
    private readonly paymentFactory: PaymentFactoryService,
    private readonly paystackService: PaystackService,
  ) {}

  async getAllPlans() {
    return this.planRepository.find({ where: { isActive: true } });
  }

  async getUserSubscriptionStatus(userId: string) {
    const sub = await this.subRepository.findOne({
      where: { user: { id: userId }, status: 'active' },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!sub) {
      const freePlan = await this.planRepository.findOne({
        where: { slug: 'free' },
      });
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

      const freePlan = await this.planRepository.findOne({
        where: { slug: 'free' },
      });
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
    // Determine plan slug based on interval
    const interval = dto?.interval || 'monthly';
    const slug = interval === 'annually' ? 'premium-yearly' : 'premium';

    const plan = await this.planRepository.findOne({
      where: { slug },
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
    const paidSlots = await this.getPurchasedAdditionalBankAccountSlots(userId);
    const usedPaidSlots = Math.max(linkedAccounts - FREE_INCLUDED_BANK_ACCOUNTS, 0);

    return {
      price,
      currency: 'NGN',
      freeIncludedAccounts: FREE_INCLUDED_BANK_ACCOUNTS,
      linkedAccounts,
      paidSlots,
      availableSlots: Math.max(paidSlots - usedPaidSlots, 0),
      paymentRequiredForNextAccount:
        linkedAccounts >= FREE_INCLUDED_BANK_ACCOUNTS + paidSlots,
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
    if (linkedAccounts < FREE_INCLUDED_BANK_ACCOUNTS) {
      return;
    }

    const paidSlots = await this.getPurchasedAdditionalBankAccountSlots(userId);
    if (linkedAccounts >= FREE_INCLUDED_BANK_ACCOUNTS + paidSlots) {
      throw new BadRequestException(
        'Additional bank account payment required before linking another account',
      );
    }
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

    await this.subRepository.update(
      { user: { id: userId }, status: 'active' },
      { status: 'canceled', canceledAt: new Date() },
    );

    const startDate = new Date();
    const endDate = new Date(startDate);

    if (
      plan.interval === 'year' ||
      plan.interval === 'annually' ||
      plan.interval === 'yearly'
    ) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else if (plan.interval === 'month' || plan.interval === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setDate(endDate.getDate() + 30);
    }

    let gatewaySubscriptionId = '';
    let gatewayEmailToken = '';
    if (plan.gatewayPlanId && customerCode && authorization?.authorization_code) {
      const created = await this.paystackService.createSubscription({
        customer: customerCode,
        plan: plan.gatewayPlanId,
        authorization: authorization.authorization_code,
      });
      gatewaySubscriptionId = created.subscriptionCode;
      gatewayEmailToken = created.emailToken;
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
      return 'Premium Subscription';
    }

    if (type === ADDITIONAL_BANK_ACCOUNT_FEE_TYPE) {
      return 'Additional Bank Account Fee';
    }

    return 'Payment';
  }

  private async getLatestSubscription(userId: string): Promise<Subscription | null> {
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
