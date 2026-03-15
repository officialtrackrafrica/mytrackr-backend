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
    private readonly paymentFactory: PaymentFactoryService,
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

  async initializeSubscription(user: User, dto: InitializeSubscriptionDto) {
    const plan = await this.planRepository.findOne({
      where: { id: dto.planId },
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

    if (plan.interval === 'year') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else if (plan.interval === 'month') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setDate(endDate.getDate() + 30);
    }

    const sub = this.subRepository.create({
      user,
      plan,
      status: 'active',
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      gatewayCustomerCode: customerCode,
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
}
