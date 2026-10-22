import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BusinessService } from '../../business/services/business.service';
import {
  AccountingTreatment,
  getAccountingTreatment,
} from '../../common/accounting/accounting-treatment';

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

    return this.calculatePnlForBusiness(businessId, startDate, endDate);
  }

  async calculatePnlForBusiness(
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const summary = await this.getCategorisedSummary(
      businessId,
      startDate,
      endDate,
    );

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
        lines: summary.incomeLines,
        total: summary.totalRevenue,
      },
      cogs: {
        lines: summary.cogsLines,
        total: summary.totalCogs,
      },
      grossProfit: summary.grossProfit,
      grossProfitMargin: summary.grossProfitMargin,
      expenses: {
        operating: {
          lines: summary.operatingExpenseLines,
          total: summary.totalOperatingExpenses,
        },
        other: {
          lines: summary.otherExpenseLines,
          total: summary.totalOtherExpenses,
        },
        total: summary.totalExpenses,
      },
      netProfit: this.roundToTwoDecimalPlaces(summary.netProfit),
      netProfitMargin: this.roundToTwoDecimalPlaces(summary.netProfitMargin),
      metadata: {
        uncategorisedCount: parseInt(uncategorisedStats?.count || '0', 10),
        uncategorisedValue: parseFloat(uncategorisedStats?.totalValue || '0'),
      },
    };
  }

  async getCategorisedSummary(
    businessId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const transactions = await this.transactionRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.subCategoryRef', 'subCategoryRef')
      .addSelect('subCategoryRef.accountingType')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.isCategorised = :isCat', { isCat: true })
      .getMany();

    const incomeLines: { subCategory: any; amount: number }[] = [];
    const cogsLines: { subCategory: any; amount: number }[] = [];
    const operatingExpenseLines: { subCategory: any; amount: number }[] = [];
    const otherExpenseLines: { subCategory: any; amount: number }[] = [];

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalOperatingExpenses = 0;
    let totalOtherExpenses = 0;

    const addLine = (
      lines: { subCategory: any; amount: number }[],
      subCategory: string | null,
      amount: number,
    ) => {
      const label = subCategory || 'Unspecified';
      const existing = lines.find((line) => line.subCategory === label);
      if (existing) existing.amount += amount;
      else lines.push({ subCategory: label, amount });
    };

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const treatment = getAccountingTreatment(tx);

      if (treatment === AccountingTreatment.REVENUE) {
        addLine(incomeLines, tx.subCategory, amount);
        totalRevenue += amount;
        continue;
      }

      if (treatment === AccountingTreatment.COGS) {
        addLine(cogsLines, tx.subCategory, amount);
        totalCogs += amount;
        continue;
      }

      if (treatment === AccountingTreatment.OTHER_EXPENSE) {
        addLine(otherExpenseLines, tx.subCategory, amount);
        totalOtherExpenses += amount;
        continue;
      }

      if (treatment === AccountingTreatment.OPERATING_EXPENSE) {
        addLine(operatingExpenseLines, tx.subCategory, amount);
        totalOperatingExpenses += amount;
        continue;
      }

      if (
        treatment === AccountingTreatment.REFUND_REVERSAL &&
        tx.direction === TransactionDirection.CREDIT
      ) {
        addLine(operatingExpenseLines, 'Refunds and reversals', -amount);
        totalOperatingExpenses -= amount;
      }
    }

    const totalExpenses = totalOperatingExpenses + totalOtherExpenses;
    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    return {
      incomeLines,
      cogsLines,
      operatingExpenseLines,
      otherExpenseLines,
      totalRevenue,
      totalCogs,
      totalOperatingExpenses,
      totalOtherExpenses,
      totalExpenses,
      grossProfit,
      grossProfitMargin:
        totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
      netProfit,
      netProfitMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
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

  private roundToTwoDecimalPlaces(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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
