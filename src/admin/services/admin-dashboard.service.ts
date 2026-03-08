import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Session } from '../../auth/entities/session.entity';
import { Transaction } from '../../mono/entities/transaction.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';

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
  ) {}

  async getStats() {
    const [totalUsers, activeUsers, totalAccounts, totalTransactions] =
      await Promise.all([
        this.usersRepository.count(),
        this.usersRepository.count({ where: { isActive: true } }),
        this.accountsRepository.count(),
        this.transactionsRepository.count(),
      ]);

    const volumeResult = await this.transactionsRepository
      .createQueryBuilder('tx')
      .select('SUM(CAST(tx.amount AS BIGINT))', 'totalVolume')
      .getRawOne();

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      totalLinkedAccounts: totalAccounts,
      totalTransactions,
      totalTransactionVolume: volumeResult?.totalVolume || 0,
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
}
