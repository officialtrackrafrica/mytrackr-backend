import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';
import { BusinessService } from '../../business/services/business.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    private readonly businessService: BusinessService,
  ) {}

  async getDashboardMetrics(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    const transactions = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getMany();

    const bankAccounts = await this.bankAccountRepository
      .createQueryBuilder('ba')
      .where('ba.businessId = :businessId', { businessId })
      .getMany();

    let revenue = 0;
    let expenses = 0;
    let totalCogs = 0;
    let cashOut = 0;
    let uncategorisedCount = 0;

    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1,
    );

    for (const tx of transactions) {
      const amount = Number(tx.amount);

      if (tx.category === TransactionCategory.TRANSFER) continue;

      if (tx.category === TransactionCategory.INCOME) {
        revenue += amount;
      } else if (tx.category === TransactionCategory.COGS) {
        totalCogs += amount;
      } else if (tx.category === TransactionCategory.EXPENSE) {
        expenses += amount;
      } else {
        if (!tx.isCategorised) uncategorisedCount++;
        if (tx.direction === TransactionDirection.CREDIT) {
          revenue += amount;
        } else if (tx.direction === TransactionDirection.DEBIT) {
          expenses += amount;
        }
      }

      if (
        tx.direction === TransactionDirection.DEBIT &&
        tx.category !== TransactionCategory.TRANSFER
      ) {
        cashOut += amount;
      }
    }

    expenses = expenses + totalCogs;
    const netProfit = revenue - expenses;
    const burnRate = cashOut / diffMonths;

    const cashBalance = bankAccounts.reduce(
      (acc, account) => acc + Number(account.currentBalance),
      0,
    );

    return {
      revenue,
      expenses,
      netProfit,
      cashBalance,
      uncategorisedCount,
      burnRate,
    };
  }
}
