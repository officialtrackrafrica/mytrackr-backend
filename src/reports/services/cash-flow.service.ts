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
export class CashFlowService {
  private readonly logger = new Logger(CashFlowService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    private readonly businessService: BusinessService,
  ) {}

  async calculateCashFlow(userId: string, startDate: Date, endDate: Date) {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    const results = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .select('tx.direction', 'direction')
      .addSelect('tx.category', 'category')
      .addSelect('SUM(tx.amount)', 'total')
      .groupBy('tx.direction')
      .addGroupBy('tx.category')
      .getRawMany();

    let cashIn = 0;
    let cashOut = 0;
    let internalIn = 0;
    let internalOut = 0;

    for (const r of results) {
      const amount = parseFloat(r.total);

      if (r.category === TransactionCategory.TRANSFER) {
        if (r.direction === TransactionDirection.CREDIT) {
          internalIn += amount;
        } else {
          internalOut += amount;
        }
      } else {
        if (r.direction === TransactionDirection.CREDIT) {
          cashIn += amount;
        } else {
          cashOut += amount;
        }
      }
    }

    const netCashFlow = cashIn - cashOut;

    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1,
    );
    const monthlyBurnRate = cashOut / diffMonths;

    const bankAccounts = await this.bankAccountRepository.find({
      where: { businessId },
    });
    const cashBalance = bankAccounts.reduce(
      (acc, account) => acc + Number(account.currentBalance),
      0,
    );

    const monthsOfRunway =
      monthlyBurnRate > 0
        ? Math.round((cashBalance / monthlyBurnRate) * 10) / 10
        : null;
    const lowRunwayAlert = monthsOfRunway !== null && monthsOfRunway < 2;

    return {
      cashIn,
      cashOut,
      netCashFlow,
      internalTransfers: {
        internalIn,
        internalOut,
      },
      monthlyBurnRate,
      cashBalance,
      monthsOfRunway,
      lowRunwayAlert,
    };
  }

  async generateCashFlowCsv(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const report = await this.calculateCashFlow(userId, startDate, endDate);
    const rows = [
      ['Cash Flow Statement'],
      [
        'Period',
        `${startDate.toISOString().slice(0, 10)} to ${endDate
          .toISOString()
          .slice(0, 10)}`,
      ],
      [],
      ['Metric', 'Amount'],
      ['Cash In', report.cashIn],
      ['Cash Out', report.cashOut],
      ['Net Cash Flow', report.netCashFlow],
      ['Internal Transfer In', report.internalTransfers.internalIn],
      ['Internal Transfer Out', report.internalTransfers.internalOut],
      ['Monthly Burn Rate', report.monthlyBurnRate],
      ['Cash Balance', report.cashBalance],
      ['Months of Runway', report.monthsOfRunway ?? 'N/A'],
      ['Low Runway Alert', report.lowRunwayAlert ? 'Yes' : 'No'],
    ];

    return rows.map((row) => row.map(this.csvCell).join(',')).join('\n');
  }

  private csvCell(value: string | number | boolean | null): string {
    const stringValue = String(value ?? '');
    return /[",\n\r]/.test(stringValue)
      ? `"${stringValue.replace(/"/g, '""')}"`
      : stringValue;
  }

  private emptyCashFlow() {
    return {
      cashIn: 0,
      cashOut: 0,
      netCashFlow: 0,
      internalTransfers: { internalIn: 0, internalOut: 0 },
      monthlyBurnRate: 0,
      cashBalance: 0,
      monthsOfRunway: null,
      lowRunwayAlert: false,
    };
  }
}
