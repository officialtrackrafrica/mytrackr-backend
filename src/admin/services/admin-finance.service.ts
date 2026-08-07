import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonoTransaction as Transaction } from '../../mono/entities/transaction.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';
import { PaymentTransaction } from '../../payments/entities/payment-transaction.entity';
import { Subscription } from '../../payments/entities/subscription.entity';
import {
  AdminSubscriptionHistoryQueryDto,
  DashboardQueryDto,
  TransactionQueryDto,
} from '../dto';
import {
  resolveAdminDateRange,
  serializeAdminDateRange,
} from '../utils/admin-date-range';

@Injectable()
export class AdminFinanceService {
  private readonly logger = new Logger(AdminFinanceService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(MonoAccount)
    private readonly accountsRepository: Repository<MonoAccount>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentTransactionsRepository: Repository<PaymentTransaction>,
  ) {}

  async getAllTransactions(query: TransactionQueryDto) {
    const { start, end, type, category, userId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.monoAccount', 'account')
      .leftJoin('account.user', 'user')
      .addSelect(['user.id', 'user.email', 'user.firstName', 'user.lastName'])
      .orderBy('tx.date', 'DESC')
      .skip(skip)
      .take(limit);

    if (start) {
      qb.andWhere('tx.date >= :start', { start: new Date(start) });
    }
    if (end) {
      qb.andWhere('tx.date <= :end', { end: new Date(end) });
    }
    if (type) {
      qb.andWhere('tx.type = :type', { type });
    }
    if (category) {
      qb.andWhere(
        '(tx.manualCategory = :category OR tx.category = :category)',
        { category },
      );
    }
    if (userId) {
      qb.andWhere('user.id = :userId', { userId });
    }

    const [transactions, total] = await qb.getManyAndCount();

    return {
      transactions: transactions.map((tx) => ({
        id: tx.id,
        monoTransactionId: tx.monoTransactionId,
        narration: tx.narration,
        amount: this.toMajorCurrencyUnit(tx.amount),
        type: tx.type,
        category: tx.manualCategory || tx.category,
        categorySource: tx.categorySource,
        currency: tx.currency,
        balance: this.toNullableMajorCurrencyUnit(tx.balance),
        date: tx.date,
        metadata: tx.metadata,
        account: tx.monoAccount
          ? {
              id: tx.monoAccount.id,
              name: tx.monoAccount.name,
              institutionName: tx.monoAccount.institutionName,
              user: (tx.monoAccount as any).user
                ? {
                    id: (tx.monoAccount as any).user.id,
                    email: (tx.monoAccount as any).user.email,
                    name: `${(tx.monoAccount as any).user.firstName || ''} ${(tx.monoAccount as any).user.lastName || ''}`.trim(),
                  }
                : null,
            }
          : null,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTransaction(id: string) {
    const tx = await this.transactionsRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.monoAccount', 'account')
      .leftJoin('account.user', 'user')
      .addSelect(['user.id', 'user.email', 'user.firstName', 'user.lastName'])
      .where('tx.id = :id', { id })
      .getOne();

    if (!tx) throw new NotFoundException('Transaction not found');

    return {
      id: tx.id,
      monoTransactionId: tx.monoTransactionId,
      narration: tx.narration,
      amount: this.toMajorCurrencyUnit(tx.amount),
      type: tx.type,
      category: tx.manualCategory || tx.category,
      categorySource: tx.categorySource,
      currency: tx.currency,
      balance: this.toNullableMajorCurrencyUnit(tx.balance),
      date: tx.date,
      metadata: tx.metadata,
      createdAt: tx.createdAt,
      account: tx.monoAccount
        ? {
            id: tx.monoAccount.id,
            name: tx.monoAccount.name,
            institutionName: tx.monoAccount.institutionName,
          }
        : null,
    };
  }

  async getAllAccounts() {
    const accounts = await this.accountsRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return accounts.map((acc) => ({
      id: acc.id,
      monoAccountId: acc.monoAccountId,
      name: acc.name,
      accountNumber: acc.accountNumber,
      type: acc.type,
      currency: acc.currency,
      balance: this.toNullableMajorCurrencyUnit(acc.balance),
      institutionName: acc.institutionName,
      dataStatus: acc.dataStatus,
      lastSyncedAt: acc.lastSyncedAt,
      createdAt: acc.createdAt,
      user: acc.user
        ? {
            id: acc.user.id,
            email: acc.user.email,
            name: `${acc.user.firstName || ''} ${acc.user.lastName || ''}`.trim(),
          }
        : null,
    }));
  }

  async getFinancialSummary(query: DashboardQueryDto = {}) {
    const period = query.period || 'month';
    const range = resolveAdminDateRange(query);
    let dateFormat: string;
    switch (period) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      case 'month':
      default:
        dateFormat = 'YYYY-MM';
        break;
    }

    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .select(`TO_CHAR(tx.date, '${dateFormat}')`, 'period')
      .addSelect('tx.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CAST(tx.amount AS BIGINT))', 'totalAmount')
      .where('tx.currency = :currency', { currency: 'NGN' })
      .groupBy(`TO_CHAR(tx.date, '${dateFormat}')`)
      .addGroupBy('tx.type')
      .orderBy('period', 'DESC')
      .limit(60);

    if (range?.start) {
      qb.andWhere('tx.date >= :summaryDateFrom', {
        summaryDateFrom: range.start,
      });
    }
    if (range?.end) {
      qb.andWhere('tx.date < :summaryDateTo', { summaryDateTo: range.end });
    }

    const result = await qb.getRawMany();

    const periodMap: Record<string, any> = {};
    result.forEach((r) => {
      if (!periodMap[r.period]) {
        periodMap[r.period] = {
          period: r.period,
          credits: 0,
          debits: 0,
          creditCount: 0,
          debitCount: 0,
        };
      }
      if (r.type === 'credit') {
        periodMap[r.period].credits = this.toMajorCurrencyUnit(
          r.totalAmount || 0,
        );
        periodMap[r.period].creditCount = parseInt(r.count, 10);
      } else {
        periodMap[r.period].debits = this.toMajorCurrencyUnit(
          r.totalAmount || 0,
        );
        periodMap[r.period].debitCount = parseInt(r.count, 10);
      }
    });

    return {
      period,
      filters: serializeAdminDateRange(query, range),
      currency: 'NGN',
      data: Object.values(periodMap),
    };
  }

  async getAllSubscriptionHistory(query: AdminSubscriptionHistoryQueryDto) {
    const { page = 1, limit = 20, userId, status, planId, start, end } = query;
    const skip = (page - 1) * limit;

    const qb = this.subscriptionsRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .orderBy('subscription.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (userId) {
      qb.andWhere('user.id = :userId', { userId });
    }

    if (status) {
      qb.andWhere('subscription.status = :status', { status });
    }

    if (planId) {
      qb.andWhere('plan.id = :planId', { planId });
    }

    if (start) {
      qb.andWhere('subscription.createdAt >= :start', {
        start: new Date(start),
      });
    }

    if (end) {
      qb.andWhere('subscription.createdAt <= :end', { end: new Date(end) });
    }

    const [subscriptions, total] = await qb.getManyAndCount();
    const userIds = [
      ...new Set(
        subscriptions
          .map((subscription) => subscription.user?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const payments = userIds.length
      ? await this.paymentTransactionsRepository
          .createQueryBuilder('payment')
          .leftJoinAndSelect('payment.user', 'user')
          .where('user.id IN (:...userIds)', { userIds })
          .orderBy('payment.createdAt', 'DESC')
          .getMany()
      : [];

    const paymentsByUserId = new Map<string, PaymentTransaction[]>();
    payments.forEach((payment) => {
      const paymentUserId = payment.user?.id;
      if (!paymentUserId) return;
      const userPayments = paymentsByUserId.get(paymentUserId) || [];
      userPayments.push(payment);
      paymentsByUserId.set(paymentUserId, userPayments);
    });

    return {
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        user: subscription.user
          ? {
              id: subscription.user.id,
              email: subscription.user.email,
              name: [subscription.user.firstName, subscription.user.lastName]
                .filter(Boolean)
                .join(' '),
            }
          : null,
        plan: subscription.plan
          ? {
              id: subscription.plan.id,
              name: subscription.plan.name,
              slug: subscription.plan.slug,
              price: Number(subscription.plan.price),
              currency: subscription.plan.currency,
              interval: subscription.plan.interval,
            }
          : null,
        gatewaySubscriptionId: subscription.gatewaySubscriptionId || undefined,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        payments: subscription.user?.id
          ? (paymentsByUserId.get(subscription.user.id) || []).map(
              (payment) => ({
                id: payment.id,
                amount: Number(payment.amount),
                currency: payment.currency,
                gateway: payment.gateway,
                reference: payment.reference,
                gatewayReference: payment.gatewayReference || undefined,
                status: payment.status,
                paymentMethod: payment.paymentMethod || undefined,
                metadata: payment.metadata || null,
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt,
              }),
            )
          : [],
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private toMajorCurrencyUnit(amount: number | string): number {
    return Math.round(Number(amount)) / 100;
  }

  private toNullableMajorCurrencyUnit(
    amount: number | string | null | undefined,
  ): number | null {
    return amount === null || amount === undefined
      ? null
      : this.toMajorCurrencyUnit(amount);
  }
}
