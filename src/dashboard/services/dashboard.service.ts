import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';
import { BusinessService } from '../../business/services/business.service';
import {
  AccountingTreatment,
  getAccountingTreatment,
  isOperatingExpense,
} from '../../common/accounting/accounting-treatment';

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
      .leftJoinAndSelect('tx.subCategoryRef', 'subCategoryRef')
      .addSelect('subCategoryRef.accountingType')
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
    let refunds = 0;
    let uncategorisedCount = 0;

    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1,
    );

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const treatment = getAccountingTreatment(tx);

      if (treatment === AccountingTreatment.REVENUE) {
        revenue += amount;
      } else if (treatment === AccountingTreatment.COGS) {
        totalCogs += amount;
      } else if (
        treatment === AccountingTreatment.OPERATING_EXPENSE ||
        treatment === AccountingTreatment.OTHER_EXPENSE
      ) {
        expenses += amount;
      } else if (
        treatment === AccountingTreatment.REFUND_REVERSAL &&
        tx.direction === TransactionDirection.CREDIT
      ) {
        expenses -= amount;
        refunds += amount;
      }

      if (treatment === AccountingTreatment.UNCLASSIFIED) {
        uncategorisedCount++;
      }

      if (isOperatingExpense(treatment)) {
        cashOut += amount;
      }
    }

    expenses = expenses + totalCogs;
    const netProfit = revenue - expenses;
    const burnRate = Math.max(0, cashOut - refunds) / diffMonths;

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
