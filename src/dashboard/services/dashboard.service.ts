import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';
import { Business } from '../../business/entities/business.entity';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  async getDashboardMetrics(
    userId: string,
    businessId: string | null,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // 1. Fetch all data needed
    const businesses = await this.businessRepository.find({
      where: { userId },
    });

    const activeBusinessIds = businesses.map((b) => b.id);

    let txQuery = this.transactionRepository.createQueryBuilder('tx');
    let baQuery = this.bankAccountRepository.createQueryBuilder('ba');

    if (businessId) {
      txQuery = txQuery.where('tx.businessId = :businessId', { businessId });
      baQuery = baQuery.where('ba.businessId = :businessId', { businessId });
    } else {
      if (activeBusinessIds.length > 0) {
        txQuery = txQuery.where(
          '(tx.businessId IN (:...activeBusinessIds) OR tx.userId = :userId)',
          { activeBusinessIds, userId },
        );
        baQuery = baQuery.where(
          '(ba.businessId IN (:...activeBusinessIds) OR ba.userId = :userId)',
          { activeBusinessIds, userId },
        );
      } else {
        txQuery = txQuery.where('tx.userId = :userId', { userId });
        baQuery = baQuery.where('ba.userId = :userId', { userId });
      }
    }

    const transactions = await txQuery
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getMany();

    const bankAccounts = await baQuery.getMany();

    // 2. Initialize aggregators
    const createEmptyMetrics = () => ({
      revenue: 0,
      expenses: 0,
      netProfit: 0,
      cashBalance: 0,
      uncategorisedCount: 0,
      burnRate: 0,
      _totalCogs: 0, // temporary internal helpers
      _cashOut: 0,
    });

    const global = createEmptyMetrics();
    const unassigned = createEmptyMetrics();
    const businessMap = new Map<string, any>();

    businesses.forEach((b) => {
      businessMap.set(b.id, {
        businessId: b.id,
        businessName: b.name,
        metrics: createEmptyMetrics(),
      });
    });

    // 3. Aggregate Transactions
    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1,
    );

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const targets = [global];

      if (tx.businessId === userId) {
        targets.push(unassigned);
      } else if (businessMap.has(tx.businessId)) {
        targets.push(businessMap.get(tx.businessId).metrics);
      }

      targets.forEach((m) => {
        if (tx.category === TransactionCategory.INTERNAL_TRANSFER) return;

        if (tx.category === TransactionCategory.INCOME) {
          m.revenue += amount;
        } else if (tx.category === TransactionCategory.COGS) {
          m._totalCogs += amount;
        } else if (tx.category === TransactionCategory.EXPENSE) {
          m.expenses += amount;
        } else {
          if (!tx.isCategorised) m.uncategorisedCount++;
          if (tx.direction === TransactionDirection.CREDIT) {
            m.revenue += amount;
          } else if (tx.direction === TransactionDirection.DEBIT) {
            m.expenses += amount;
          }
        }

        if (
          tx.direction === TransactionDirection.DEBIT &&
          tx.category !== TransactionCategory.INTERNAL_TRANSFER
        ) {
          m._cashOut += amount;
        }
      });
    }

    // 4. Aggregate Bank Balances
    bankAccounts.forEach((acc) => {
      const balance = Number(acc.currentBalance);
      global.cashBalance += balance;
      if (acc.businessId === userId) {
        unassigned.cashBalance += balance;
      } else if (businessMap.has(acc.businessId)) {
        businessMap.get(acc.businessId).metrics.cashBalance += balance;
      }
    });

    // 5. Finalize Calculations
    const finalize = (m: any) => {
      m.expenses = m.expenses + m._totalCogs;
      m.netProfit = m.revenue - m.expenses;
      m.burnRate = m._cashOut / diffMonths;
      delete m._totalCogs;
      delete m._cashOut;
    };

    finalize(global);
    finalize(unassigned);
    businessMap.forEach((b) => finalize(b.metrics));

    return {
      global,
      businesses: Array.from(businessMap.values()),
      unassigned,
    };
  }
}
