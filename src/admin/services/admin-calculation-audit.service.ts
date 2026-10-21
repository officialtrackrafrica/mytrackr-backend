import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { CashFlowService } from '../../reports/services/cash-flow.service';
import { PnlService } from '../../reports/services/pnl.service';
import { BalanceSheetService } from '../../reports/services/balance-sheet.service';

const OTHER_EXPENSE_SUB_CATEGORIES = [
  'Tax payment',
  'Tax',
  'Interest on loan',
  'Interest',
  'Loan Interest',
];

export type AuditTreatment = {
  pnl: 'Revenue' | 'COGS' | 'Operating expense' | 'Other expense' | null;
  pnlReason: string;
  cashFlow: 'Cash in' | 'Cash out' | null;
  cashFlowReason: string;
  burnRate: boolean;
  burnRateReason: string;
};

export type AuditedTransaction = Transaction & { treatment: AuditTreatment };

@Injectable()
export class AdminCalculationAuditService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly pnlService: PnlService,
    private readonly cashFlowService: CashFlowService,
    private readonly balanceSheetService: BalanceSheetService,
  ) {}

  async getUsersWithLinkedAccounts() {
    return this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.business', 'business')
      .innerJoin(
        BankAccount,
        'account',
        'account.businessId = business.id',
      )
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'business.id',
        'business.name',
        'business.currency',
      ])
      .distinct(true)
      .orderBy('user.firstName', 'ASC')
      .addOrderBy('user.email', 'ASC')
      .getMany();
  }

  async getAudit(
    userId: string,
    startDate: Date,
    endDate: Date,
    includeAllTransactions = false,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['business'],
    });
    if (!user?.business) {
      throw new NotFoundException('User or business not found');
    }

    const accounts = await this.bankAccountRepository.find({
      where: { businessId: user.business.id },
      order: { bankName: 'ASC' },
    });
    if (accounts.length === 0) {
      throw new NotFoundException('This user has no linked bank account');
    }

    const transactionQuery = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId: user.business.id });
    if (!includeAllTransactions) {
      transactionQuery.andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }
    const selectedTransactions = await transactionQuery
      .orderBy('tx.date', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .getMany();

    const audited: AuditedTransaction[] = selectedTransactions.map((tx) =>
      Object.assign(tx, { treatment: this.classify(tx) }),
    );
    const [pnl, cashFlow, balanceSheet] = await Promise.all([
      this.pnlService.calculatePnlForBusiness(
        user.business.id,
        startDate,
        endDate,
      ),
      this.cashFlowService.calculateCashFlow(userId, startDate, endDate),
      this.balanceSheetService.calculateBalanceSheet(userId),
    ]);

    return {
      user,
      business: user.business,
      accounts,
      transactions: audited,
      pnl,
      cashFlow,
      balanceSheet,
      includesAllStoredTransactions: includeAllTransactions,
      counts: {
        total: audited.length,
        pnlIncluded: audited.filter((tx) => tx.treatment.pnl !== null).length,
        cashFlowIncluded: audited.filter(
          (tx) => tx.treatment.cashFlow !== null,
        ).length,
        burnRateIncluded: audited.filter((tx) => tx.treatment.burnRate).length,
      },
    };
  }

  private classify(tx: Transaction): AuditTreatment {
    const isTransfer = tx.category === TransactionCategory.TRANSFER;
    let pnl: AuditTreatment['pnl'] = null;
    let pnlReason = 'Excluded: category/direction is not used by P&L';

    if (!tx.isCategorised) {
      pnlReason = 'Excluded: transaction is not categorised';
    } else if (isTransfer) {
      pnlReason = 'Excluded: internal transfer';
    } else if (
      tx.category === TransactionCategory.INCOME &&
      tx.direction === TransactionDirection.CREDIT
    ) {
      pnl = 'Revenue';
      pnlReason = 'Included as revenue: categorised INCOME credit';
    } else if (
      tx.category === TransactionCategory.COGS &&
      tx.direction === TransactionDirection.DEBIT
    ) {
      pnl = 'COGS';
      pnlReason = 'Included as COGS: categorised COGS debit';
    } else if (
      tx.category === TransactionCategory.EXPENSE &&
      tx.direction === TransactionDirection.DEBIT
    ) {
      const isOther = OTHER_EXPENSE_SUB_CATEGORIES.some((name) =>
        tx.subCategory?.toLowerCase().includes(name.toLowerCase()),
      );
      pnl = isOther ? 'Other expense' : 'Operating expense';
      pnlReason = `Included as ${pnl.toLowerCase()}`;
    }

    let cashFlow: AuditTreatment['cashFlow'] = null;
    let cashFlowReason = 'Excluded: internal transfer';
    if (!isTransfer && tx.direction === TransactionDirection.CREDIT) {
      cashFlow = 'Cash in';
      cashFlowReason = 'Included as cash in: non-transfer credit';
    } else if (!isTransfer && tx.direction === TransactionDirection.DEBIT) {
      cashFlow = 'Cash out';
      cashFlowReason = 'Included as cash out: non-transfer debit';
    }

    const burnRate = cashFlow === 'Cash out';
    return {
      pnl,
      pnlReason,
      cashFlow,
      cashFlowReason,
      burnRate,
      burnRateReason: burnRate
        ? 'Included: non-transfer debit contributes to cash out'
        : isTransfer
          ? 'Excluded: internal transfer'
          : 'Excluded: only non-transfer debits contribute to burn rate',
    };
  }
}
