import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../mono/entities/transaction.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';
import { TransactionQueryDto } from '../dto';

@Injectable()
export class AdminFinanceService {
  private readonly logger = new Logger(AdminFinanceService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(MonoAccount)
    private readonly accountsRepository: Repository<MonoAccount>,
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
        amount: tx.amount,
        type: tx.type,
        category: tx.manualCategory || tx.category,
        categorySource: tx.categorySource,
        currency: tx.currency,
        balance: tx.balance,
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
      amount: tx.amount,
      type: tx.type,
      category: tx.manualCategory || tx.category,
      categorySource: tx.categorySource,
      currency: tx.currency,
      balance: tx.balance,
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
      balance: acc.balance,
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

  async getFinancialSummary(period: 'day' | 'week' | 'month' = 'month') {
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

    const result = await this.transactionsRepository
      .createQueryBuilder('tx')
      .select(`TO_CHAR(tx.date, '${dateFormat}')`, 'period')
      .addSelect('tx.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CAST(tx.amount AS BIGINT))', 'totalAmount')
      .groupBy(`TO_CHAR(tx.date, '${dateFormat}')`)
      .addGroupBy('tx.type')
      .orderBy('period', 'DESC')
      .limit(60)
      .getRawMany();

    // Group by period
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
        periodMap[r.period].credits = r.totalAmount || 0;
        periodMap[r.period].creditCount = parseInt(r.count, 10);
      } else {
        periodMap[r.period].debits = r.totalAmount || 0;
        periodMap[r.period].debitCount = parseInt(r.count, 10);
      }
    });

    return {
      period,
      data: Object.values(periodMap),
    };
  }
}
