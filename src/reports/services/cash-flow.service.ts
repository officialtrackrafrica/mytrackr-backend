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

    let cashIn = 0;
    let cashOut = 0;
    let internalIn = 0;
    let internalOut = 0;
    let operatingIn = 0;
    let operatingOut = 0;
    let investingIn = 0;
    let investingOut = 0;
    let financingIn = 0;
    let financingOut = 0;
    let unclassifiedIn = 0;
    let unclassifiedOut = 0;
    let refundIn = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const isCredit = tx.direction === TransactionDirection.CREDIT;
      const treatment = getAccountingTreatment(tx);

      if (treatment === AccountingTreatment.INTERNAL_TRANSFER) {
        if (isCredit) {
          internalIn += amount;
        } else {
          internalOut += amount;
        }
        continue;
      }

      if (isCredit) cashIn += amount;
      else cashOut += amount;

      if (treatment === AccountingTreatment.REVENUE) operatingIn += amount;
      else if (isOperatingExpense(treatment)) operatingOut += amount;
      else if (treatment === AccountingTreatment.REFUND_REVERSAL && isCredit) {
        operatingIn += amount;
        refundIn += amount;
      } else if (treatment === AccountingTreatment.ASSET_MOVEMENT) {
        if (isCredit) investingIn += amount;
        else investingOut += amount;
      } else if (treatment === AccountingTreatment.LOAN_REPAYMENT) {
        financingOut += amount;
      } else if (
        treatment === AccountingTreatment.LOAN_RECEIVED ||
        treatment === AccountingTreatment.OWNER_CONTRIBUTION
      ) {
        financingIn += amount;
      } else if (treatment === AccountingTreatment.OWNER_DRAWING) {
        financingOut += amount;
      } else if (treatment === AccountingTreatment.UNCLASSIFIED) {
        if (isCredit) unclassifiedIn += amount;
        else unclassifiedOut += amount;
      }
    }

    const netCashFlow = cashIn - cashOut;

    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1,
    );
    const confirmedOperatingOut = Math.max(0, operatingOut - refundIn);
    const monthlyBurnRate = confirmedOperatingOut / diffMonths;

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
      operating: {
        cashIn: operatingIn,
        cashOut: operatingOut,
        refunds: refundIn,
        netCashFlow: operatingIn - operatingOut,
      },
      investing: {
        cashIn: investingIn,
        cashOut: investingOut,
        netCashFlow: investingIn - investingOut,
      },
      financing: {
        cashIn: financingIn,
        cashOut: financingOut,
        netCashFlow: financingIn - financingOut,
      },
      unclassified: {
        cashIn: unclassifiedIn,
        cashOut: unclassifiedOut,
        netCashFlow: unclassifiedIn - unclassifiedOut,
      },
      confirmedOperatingOut,
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
      ['Operating Cash In', report.operating.cashIn],
      ['Operating Cash Out', report.operating.cashOut],
      ['Operating Refunds', report.operating.refunds],
      ['Investing Cash In', report.investing.cashIn],
      ['Investing Cash Out', report.investing.cashOut],
      ['Financing Cash In', report.financing.cashIn],
      ['Financing Cash Out', report.financing.cashOut],
      ['Unclassified Cash In', report.unclassified.cashIn],
      ['Unclassified Cash Out', report.unclassified.cashOut],
      ['Confirmed Operating Out', report.confirmedOperatingOut],
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
      operating: { cashIn: 0, cashOut: 0, refunds: 0, netCashFlow: 0 },
      investing: { cashIn: 0, cashOut: 0, netCashFlow: 0 },
      financing: { cashIn: 0, cashOut: 0, netCashFlow: 0 },
      unclassified: { cashIn: 0, cashOut: 0, netCashFlow: 0 },
      confirmedOperatingOut: 0,
      monthlyBurnRate: 0,
      cashBalance: 0,
      monthsOfRunway: null,
      lowRunwayAlert: false,
    };
  }
}
