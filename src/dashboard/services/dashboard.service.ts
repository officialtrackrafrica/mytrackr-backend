import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
  ) {
    let businessIds: string[] = [];
    if (businessId) {
      businessIds = [businessId];
    } else {
      const businesses = await this.businessRepository.find({
        where: { userId },
        select: ['id'],
      });
      businessIds = businesses.map((b) => b.id);
    }

    if (businessIds.length === 0) {
      return this.emptyDashboard();
    }

    const transactions = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId IN (:...businessIds)', { businessIds })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getMany();

    const bankAccounts = await this.bankAccountRepository.find({
      where: { businessId: In(businessIds) },
    });

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;
    let cashOut = 0;
    let uncategorisedItems = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);

      if (!tx.isCategorised) {
        uncategorisedItems++;
      } else {
        if (tx.category === TransactionCategory.INCOME) totalRevenue += amount;
        if (tx.category === TransactionCategory.COGS) totalCogs += amount;
        if (tx.category === TransactionCategory.EXPENSE)
          totalExpenses += amount;
      }

      if (
        tx.direction === TransactionDirection.DEBIT &&
        tx.category !== TransactionCategory.INTERNAL_TRANSFER
      ) {
        cashOut += amount;
      }
    }

    const netProfit = totalRevenue - totalCogs - totalExpenses;
    const cashBalance = bankAccounts.reduce(
      (acc, account) => acc + Number(account.currentBalance),
      0,
    );

    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1,
    );
    const monthlyBurnRate = cashOut / diffMonths;

    return {
      totalRevenue,
      totalExpenses: totalCogs + totalExpenses,
      netProfit,
      cashBalance,
      uncategorisedItems,
      monthlyBurnRate,
    };
  }

  private emptyDashboard() {
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      cashBalance: 0,
      uncategorisedItems: 0,
      monthlyBurnRate: 0,
    };
  }
}
