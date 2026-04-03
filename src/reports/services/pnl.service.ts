import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BusinessService } from '../../business/services/business.service';

const OTHER_EXPENSE_SUB_CATEGORIES = [
  'Tax payment',
  'Tax',
  'Interest on loan',
  'Interest',
  'Loan Interest',
];

@Injectable()
export class PnlService {
  private readonly logger = new Logger(PnlService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly businessService: BusinessService,
  ) {}

  async calculatePnl(userId: string, startDate: Date, endDate: Date) {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    const baseQuery = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.isCategorised = :isCat', { isCat: true })
      .andWhere('tx.category != :transfer', {
        transfer: TransactionCategory.TRANSFER,
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
    const operatingExpenseLines: { subCategory: any; amount: number }[] = [];
    const otherExpenseLines: { subCategory: any; amount: number }[] = [];

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalOperatingExpenses = 0;
    let totalOtherExpenses = 0;

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
        const isOther = OTHER_EXPENSE_SUB_CATEGORIES.some(
          (cat) =>
            r.subCategory &&
            r.subCategory.toLowerCase().includes(cat.toLowerCase()),
        );

        if (isOther) {
          otherExpenseLines.push({ subCategory: r.subCategory, amount });
          totalOtherExpenses += amount;
        } else {
          operatingExpenseLines.push({ subCategory: r.subCategory, amount });
          totalOperatingExpenses += amount;
        }
      }
    }

    const totalExpenses = totalOperatingExpenses + totalOtherExpenses;
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
        operating: {
          lines: operatingExpenseLines,
          total: totalOperatingExpenses,
        },
        other: {
          lines: otherExpenseLines,
          total: totalOtherExpenses,
        },
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

  async generatePnlCsv(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const report = await this.calculatePnl(userId, startDate, endDate);
    const rows: string[] = [];

    rows.push('Profit & Loss Report');
    rows.push(
      `Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    );
    rows.push('');

    // Revenue
    rows.push('REVENUE,Amount');
    report.revenue.lines.forEach((l) => {
      rows.push(`${l.subCategory},${l.amount.toFixed(2)}`);
    });
    rows.push(`Total Revenue,${report.revenue.total.toFixed(2)}`);
    rows.push('');

    // COGS
    rows.push('COST OF GOODS SOLD,Amount');
    report.cogs.lines.forEach((l) => {
      rows.push(`${l.subCategory},${l.amount.toFixed(2)}`);
    });
    rows.push(`Total COGS,${report.cogs.total.toFixed(2)}`);
    rows.push('');

    rows.push(`Gross Profit,${report.grossProfit.toFixed(2)}`);
    rows.push('');

    // Operating Expenses
    rows.push('OPERATING EXPENSES,Amount');
    report.expenses.operating.lines.forEach((l) =>
      rows.push(`${l.subCategory},${l.amount.toFixed(2)}`),
    );
    rows.push(
      `Total Operating Expenses,${report.expenses.operating.total.toFixed(2)}`,
    );
    rows.push('');

    // Other Expenses
    rows.push('OTHER EXPENSES,Amount');
    report.expenses.other.lines.forEach((l) =>
      rows.push(`${l.subCategory},${l.amount.toFixed(2)}`),
    );
    rows.push(`Total Other Expenses,${report.expenses.other.total.toFixed(2)}`);
    rows.push('');

    rows.push(`Net Profit,${report.netProfit.toFixed(2)}`);
    rows.push(`Net Profit Margin,${report.netProfitMargin.toFixed(2)}%`);

    return rows.join('\n');
  }

  private emptyPnl() {
    return {
      revenue: { lines: [], total: 0 },
      cogs: { lines: [], total: 0 },
      grossProfit: 0,
      grossProfitMargin: 0,
      expenses: { lines: [], total: 0 },
      netProfit: 0,
      netProfitMargin: 0,
      metadata: { uncategorisedCount: 0, uncategorisedValue: 0 },
    };
  }
}
