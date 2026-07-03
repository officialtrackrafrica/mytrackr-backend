import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Session } from '../../auth/entities/session.entity';
import { MonoTransaction as Transaction } from '../../mono/entities/transaction.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';
import { Transaction as FinanceTransaction } from '../../finance/entities/transaction.entity';
import { Subscription } from '../../payments/entities/subscription.entity';
import { Plan } from '../../payments/entities/plan.entity';
import { PaymentTransaction } from '../../payments/entities/payment-transaction.entity';
import { AdminStatsQueryDto } from '../dto';

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(MonoAccount)
    private readonly accountsRepository: Repository<MonoAccount>,
    @InjectRepository(FinanceTransaction)
    private readonly financeTransactionsRepository: Repository<FinanceTransaction>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentTransactionsRepository: Repository<PaymentTransaction>,
  ) {}

  async getStats(query: AdminStatsQueryDto = {}) {
    const range = this.resolveDateRange(query);

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      deletedAccounts,
      totalSyncedBankAccounts,
      monoTransactionCount,
      financeTransactionCount,
      monoVolumeResult,
      financeVolumeResult,
      monoUncategorized,
      financeUncategorized,
      activeSubscriptions,
      failedSubscriptions,
      subscriptionRevenueResult,
      paymentRevenueResult,
      churnedSubscriptions,
      churnBaseSubscriptions,
      planSubscriptionStats,
    ] = await Promise.all([
      this.countUsers(range),
      this.countUsers(range, { isActive: true }),
      this.countUsers(range, { isActive: false }),
      this.countDeletedAccounts(range),
      this.countSyncedBankAccounts(range),
      this.countMonoTransactions(range),
      this.countFinanceTransactions(range),
      this.sumMonoTransactionVolume(range),
      this.sumFinanceTransactionVolume(range),
      this.countUncategorizedMonoTransactions(range),
      this.countUncategorizedFinanceTransactions(range),
      this.countSubscriptions(range, 'active'),
      this.countFailedSubscriptions(range),
      this.sumActiveSubscriptionRevenue(range),
      this.sumSuccessfulSubscriptionPayments(range),
      this.countChurnedSubscriptions(range),
      this.countChurnBaseSubscriptions(range),
      this.getPlanSubscriptionStats(range),
    ]);

    const totalTransactions = monoTransactionCount + financeTransactionCount;
    const recurringRevenue = Number(subscriptionRevenueResult?.total || 0);
    const realizedSubscriptionRevenue = Number(paymentRevenueResult?.total || 0);
    const churnRate =
      churnBaseSubscriptions > 0
        ? Number(((churnedSubscriptions / churnBaseSubscriptions) * 100).toFixed(2))
        : 0;

    return {
      filters: {
        date: query.date,
        dateFrom: range?.start?.toISOString(),
        dateTo: range?.end?.toISOString(),
      },
      totalUsers,
      totalSyncedBankAccounts,
      activeUsers,
      inactiveUsers,
      deletedAccounts,
      uncategorizedTransactions: monoUncategorized + financeUncategorized,
      activeSubscriptions,
      failedSubscriptions,
      recurringRevenue,
      realizedSubscriptionRevenue,
      churnRate,
      planSubscriptionStats,
      totalLinkedAccounts: totalSyncedBankAccounts,
      totalTransactions,
      totalTransactionVolume:
        Number(monoVolumeResult?.totalVolume || 0) +
        Number(financeVolumeResult?.totalVolume || 0),
    };
  }

  async getRegistrations(period: 'day' | 'week' | 'month' = 'month') {
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

    const result = await this.usersRepository
      .createQueryBuilder('user')
      .select(`TO_CHAR(user.createdAt, '${dateFormat}')`, 'period')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`TO_CHAR(user.createdAt, '${dateFormat}')`)
      .orderBy('period', 'DESC')
      .limit(30)
      .getRawMany();

    return {
      period,
      data: result.map((r) => ({
        period: r.period,
        count: parseInt(r.count, 10),
      })),
    };
  }

  async getTransactionSummary() {
    const [summary, categoryBreakdown] = await Promise.all([
      this.transactionsRepository
        .createQueryBuilder('tx')
        .select('tx.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .addSelect('SUM(CAST(tx.amount AS BIGINT))', 'totalAmount')
        .addSelect('AVG(CAST(tx.amount AS BIGINT))', 'avgAmount')
        .groupBy('tx.type')
        .getRawMany(),

      this.transactionsRepository
        .createQueryBuilder('tx')
        .select(
          "COALESCE(tx.manualCategory, tx.category, 'uncategorized')",
          'category',
        )
        .addSelect('COUNT(*)', 'count')
        .addSelect('SUM(CAST(tx.amount AS BIGINT))', 'totalAmount')
        .groupBy("COALESCE(tx.manualCategory, tx.category, 'uncategorized')")
        .orderBy('"count"', 'DESC')
        .limit(20)
        .getRawMany(),
    ]);

    return {
      byType: summary.map((s) => ({
        type: s.type,
        count: parseInt(s.count, 10),
        totalAmount: s.totalAmount || 0,
        avgAmount: Math.round(parseFloat(s.avgAmount || '0')),
      })),
      byCategory: categoryBreakdown.map((c) => ({
        category: c.category,
        count: parseInt(c.count, 10),
        totalAmount: c.totalAmount || 0,
      })),
    };
  }

  async getActiveSessions() {
    const count = await this.sessionsRepository.count({
      where: { revokedAt: IsNull() },
    });

    return { activeSessions: count };
  }

  private resolveDateRange(query: AdminStatsQueryDto) {
    const from = query.dateFrom || query.startDate;
    const to = query.dateTo || query.endDate;

    if (query.date) {
      const start = this.parseDate(query.date, 'date');
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }

    if (!from && !to) {
      return undefined;
    }

    const start = from ? this.parseDate(from, 'dateFrom') : undefined;
    const end = to ? this.parseDate(to, 'dateTo') : undefined;

    if (start && end && start > end) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    return { start, end };
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private applyDateRange<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    column: string,
    range?: { start?: Date; end?: Date },
  ) {
    if (range?.start) {
      qb.andWhere(`${alias}.${column} >= :${alias}_${column}_start`, {
        [`${alias}_${column}_start`]: range.start,
      });
    }

    if (range?.end) {
      qb.andWhere(`${alias}.${column} < :${alias}_${column}_end`, {
        [`${alias}_${column}_end`]: range.end,
      });
    }

    return qb;
  }

  private async countUsers(
    range?: { start?: Date; end?: Date },
    filters: { isActive?: boolean } = {},
  ) {
    const qb = this.usersRepository.createQueryBuilder('usr');
    if (filters.isActive !== undefined) {
      qb.andWhere('usr.isActive = :isActive', { isActive: filters.isActive });
    }
    this.applyDateRange(qb, 'usr', 'createdAt', range);
    return qb.getCount();
  }

  private async countDeletedAccounts(range?: { start?: Date; end?: Date }) {
    const qb = this.usersRepository
      .createQueryBuilder('usr')
      .where("usr.securitySettings ? 'deletedAt'");
    this.applyDateRange(qb, 'usr', 'updatedAt', range);
    return qb.getCount();
  }

  private async countSyncedBankAccounts(range?: { start?: Date; end?: Date }) {
    const qb = this.accountsRepository
      .createQueryBuilder('account')
      .where('account.lastSyncedAt IS NOT NULL');
    this.applyDateRange(qb, 'account', 'lastSyncedAt', range);
    return qb.getCount();
  }

  private async countMonoTransactions(range?: { start?: Date; end?: Date }) {
    const qb = this.transactionsRepository.createQueryBuilder('tx');
    this.applyDateRange(qb, 'tx', 'createdAt', range);
    return qb.getCount();
  }

  private async countFinanceTransactions(range?: { start?: Date; end?: Date }) {
    const qb = this.financeTransactionsRepository.createQueryBuilder('tx');
    this.applyDateRange(qb, 'tx', 'createdAt', range);
    return qb.getCount();
  }

  private async sumMonoTransactionVolume(range?: { start?: Date; end?: Date }) {
    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(CAST(tx.amount AS BIGINT)), 0)', 'totalVolume');
    this.applyDateRange(qb, 'tx', 'createdAt', range);
    return qb.getRawOne();
  }

  private async sumFinanceTransactionVolume(range?: {
    start?: Date;
    end?: Date;
  }) {
    const qb = this.financeTransactionsRepository
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(CAST(tx.amount AS NUMERIC)), 0)', 'totalVolume');
    this.applyDateRange(qb, 'tx', 'createdAt', range);
    return qb.getRawOne();
  }

  private async countUncategorizedMonoTransactions(range?: {
    start?: Date;
    end?: Date;
  }) {
    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .where('tx.isCategorised = false');
    this.applyDateRange(qb, 'tx', 'createdAt', range);
    return qb.getCount();
  }

  private async countUncategorizedFinanceTransactions(range?: {
    start?: Date;
    end?: Date;
  }) {
    const qb = this.financeTransactionsRepository
      .createQueryBuilder('tx')
      .where('tx.isCategorised = false');
    this.applyDateRange(qb, 'tx', 'createdAt', range);
    return qb.getCount();
  }

  private async countSubscriptions(
    range: { start?: Date; end?: Date } | undefined,
    status: string,
  ) {
    const qb = this.subscriptionsRepository
      .createQueryBuilder('sub')
      .where('sub.status = :status', { status });
    this.applyDateRange(qb, 'sub', 'createdAt', range);
    return qb.getCount();
  }

  private async countFailedSubscriptions(range?: { start?: Date; end?: Date }) {
    const failedSubs = await this.countSubscriptions(range, 'failed');

    const qb = this.paymentTransactionsRepository
      .createQueryBuilder('payment')
      .where('payment.status = :status', { status: 'failed' })
      .andWhere("payment.metadata ? 'planId'");
    this.applyDateRange(qb, 'payment', 'createdAt', range);

    return failedSubs + (await qb.getCount());
  }

  private async sumActiveSubscriptionRevenue(range?: {
    start?: Date;
    end?: Date;
  }) {
    const qb = this.subscriptionsRepository
      .createQueryBuilder('sub')
      .innerJoin('sub.plan', 'plan')
      .select('COALESCE(SUM(CAST(plan.price AS NUMERIC)), 0)', 'total')
      .where('sub.status = :status', { status: 'active' });
    this.applyDateRange(qb, 'sub', 'createdAt', range);
    return qb.getRawOne();
  }

  private async sumSuccessfulSubscriptionPayments(range?: {
    start?: Date;
    end?: Date;
  }) {
    const qb = this.paymentTransactionsRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(CAST(payment.amount AS NUMERIC)), 0)', 'total')
      .where('payment.status = :status', { status: 'success' })
      .andWhere("payment.metadata ? 'planId'");
    this.applyDateRange(qb, 'payment', 'createdAt', range);
    return qb.getRawOne();
  }

  private async countChurnedSubscriptions(range?: { start?: Date; end?: Date }) {
    const qb = this.subscriptionsRepository
      .createQueryBuilder('sub')
      .where('sub.status IN (:...statuses)', {
        statuses: ['canceled', 'cancelled'],
      });
    this.applyDateRange(qb, 'sub', 'canceledAt', range);
    return qb.getCount();
  }

  private async countChurnBaseSubscriptions(range?: {
    start?: Date;
    end?: Date;
  }) {
    const qb = this.subscriptionsRepository
      .createQueryBuilder('sub')
      .where('sub.status IN (:...statuses)', {
        statuses: ['active', 'canceled', 'cancelled'],
      });
    this.applyDateRange(qb, 'sub', 'createdAt', range);
    return qb.getCount();
  }

  private async getPlanSubscriptionStats(range?: { start?: Date; end?: Date }) {
    const subQb = this.subscriptionsRepository
      .createQueryBuilder('sub')
      .innerJoin('sub.plan', 'plan')
      .select('plan.id', 'planId')
      .addSelect('plan.name', 'planName')
      .addSelect('plan.slug', 'planSlug')
      .addSelect('plan.interval', 'interval')
      .addSelect('plan.currency', 'currency')
      .addSelect('CAST(plan.price AS NUMERIC)', 'price')
      .addSelect('COUNT(sub.id)', 'totalSubscriptions')
      .addSelect(
        "COUNT(sub.id) FILTER (WHERE sub.status = 'active')",
        'activeSubscriptions',
      )
      .addSelect(
        "COUNT(sub.id) FILTER (WHERE sub.status IN ('canceled', 'cancelled'))",
        'canceledSubscriptions',
      )
      .addSelect(
        "COUNT(sub.id) FILTER (WHERE sub.status = 'pending')",
        'pendingSubscriptions',
      )
      .addSelect(
        "COALESCE(SUM(CAST(plan.price AS NUMERIC)) FILTER (WHERE sub.status = 'active'), 0)",
        'recurringRevenue',
      )
      .groupBy('plan.id')
      .addGroupBy('plan.name')
      .addGroupBy('plan.slug')
      .addGroupBy('plan.interval')
      .addGroupBy('plan.currency')
      .addGroupBy('plan.price')
      .orderBy('plan.price', 'ASC');

    this.applyDateRange(subQb, 'sub', 'createdAt', range);

    const failedPaymentQb = this.paymentTransactionsRepository
      .createQueryBuilder('payment')
      .select("payment.metadata->>'planId'", 'planId')
      .addSelect('COUNT(payment.id)', 'failedSubscriptions')
      .where('payment.status = :status', { status: 'failed' })
      .andWhere("payment.metadata ? 'planId'")
      .groupBy("payment.metadata->>'planId'");

    this.applyDateRange(failedPaymentQb, 'payment', 'createdAt', range);

    const [subscriptionRows, failedRows] = await Promise.all([
      subQb.getRawMany(),
      failedPaymentQb.getRawMany(),
    ]);

    const failedByPlan = new Map(
      failedRows.map((row) => [
        row.planId,
        Number.parseInt(row.failedSubscriptions, 10),
      ]),
    );

    const planRows = await this.plansRepository.find({ order: { price: 'ASC' } });
    const statsByPlan = new Map(
      subscriptionRows.map((row) => [row.planId, row]),
    );

    return planRows.map((plan) => {
      const row = statsByPlan.get(plan.id);
      const activeSubscriptions = Number.parseInt(
        row?.activeSubscriptions || '0',
        10,
      );
      const canceledSubscriptions = Number.parseInt(
        row?.canceledSubscriptions || '0',
        10,
      );
      const churnBase = activeSubscriptions + canceledSubscriptions;

      return {
        planId: plan.id,
        planName: plan.name,
        planSlug: plan.slug,
        interval: plan.interval,
        currency: plan.currency,
        price: Number(plan.price),
        totalSubscriptions: Number.parseInt(row?.totalSubscriptions || '0', 10),
        activeSubscriptions,
        pendingSubscriptions: Number.parseInt(row?.pendingSubscriptions || '0', 10),
        canceledSubscriptions,
        failedSubscriptions: failedByPlan.get(plan.id) || 0,
        recurringRevenue: Number(row?.recurringRevenue || 0),
        churnRate:
          churnBase > 0
            ? Number(((canceledSubscriptions / churnBase) * 100).toFixed(2))
            : 0,
      };
    });
  }
}
