import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
  ) {}

  async getDashboardMetrics(
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const transactions = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getMany();

    const bankAccounts = await this.bankAccountRepository.find({
      where: { businessId },
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
}
