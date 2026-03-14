import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';

@Injectable()
export class PnlService {
  private readonly logger = new Logger(PnlService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async calculatePnl(businessId: string, startDate: Date, endDate: Date) {
    const baseQuery = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.isCategorised = :isCat', { isCat: true })
      .andWhere('tx.category != :internalTransfer', {
        internalTransfer: TransactionCategory.INTERNAL_TRANSFER,
      });

    const results = await baseQuery
      .select('tx.category', 'category')
      .addSelect('tx.subCategory', 'subCategory')
      .addSelect('tx.direction', 'direction')
      .addSelect('SUM(tx.amount)', 'total')
      .groupBy('tx.category')
      .addGroupBy('tx.subCategory')
      .addGroupBy('tx.direction')
      .getRawMany();

    const incomeLines: { subCategory: any; amount: number }[] = [];
    const cogsLines: { subCategory: any; amount: number }[] = [];
    const expenseLines: { subCategory: any; amount: number }[] = [];

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    for (const r of results) {
      const amount = parseFloat(r.total);

      if (
        r.category === TransactionCategory.INCOME &&
        r.direction === TransactionDirection.CREDIT
      ) {
        incomeLines.push({ subCategory: r.subCategory, amount });
        totalRevenue += amount;
      } else if (
        r.category === TransactionCategory.COGS &&
        r.direction === TransactionDirection.DEBIT
      ) {
        cogsLines.push({ subCategory: r.subCategory, amount });
        totalCogs += amount;
      } else if (
        r.category === TransactionCategory.EXPENSE &&
        r.direction === TransactionDirection.DEBIT
      ) {
        expenseLines.push({ subCategory: r.subCategory, amount });
        totalExpenses += amount;
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    const grossProfitMargin =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netProfitMargin =
      totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const uncategorisedStats = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.isCategorised = :isCat', { isCat: false })
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'totalValue')
      .getRawOne();

    return {
      revenue: {
        lines: incomeLines,
        total: totalRevenue,
      },
      cogs: {
        lines: cogsLines,
        total: totalCogs,
      },
      grossProfit,
      grossProfitMargin,
      expenses: {
        lines: expenseLines,
        total: totalExpenses,
      },
      netProfit,
      netProfitMargin,
      metadata: {
        uncategorisedCount: parseInt(uncategorisedStats?.count || '0', 10),
        uncategorisedValue: parseFloat(uncategorisedStats?.totalValue || '0'),
      },
    };
  }
}
