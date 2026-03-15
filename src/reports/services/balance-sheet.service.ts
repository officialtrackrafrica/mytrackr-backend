import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Asset } from '../../finance/entities/asset.entity';
import {
  Liability,
  LiabilityStatus,
} from '../../finance/entities/liability.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { Business } from '../../business/entities/business.entity';

@Injectable()
export class BalanceSheetService {
  private readonly logger = new Logger(BalanceSheetService.name);

  constructor(
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Liability)
    private readonly liabilityRepository: Repository<Liability>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  async calculateBalanceSheet(userId: string, businessId: string | null) {
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
      return this.emptyBalanceSheet();
    }

    const bankAccounts = await this.bankAccountRepository.find({
      where: { businessId: In(businessIds) },
    });
    const cashAndBankBalances = bankAccounts.reduce(
      (acc, account) => acc + Number(account.currentBalance),
      0,
    );

    const assets = await this.assetRepository.find({
      where: { businessId: In(businessIds), isArchived: false },
    });
    const businessAssets = assets.reduce(
      (acc, asset) => acc + Number(asset.currentValue || asset.purchaseValue),
      0,
    );

    const totalAssets = cashAndBankBalances + businessAssets;

    const liabilities = await this.liabilityRepository.find({
      where: { businessId: In(businessIds), status: LiabilityStatus.ACTIVE },
    });
    const totalLiabilities = liabilities.reduce(
      (acc, liability) => acc + Number(liability.amountOwed),
      0,
    );

    const capitalContrib = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId IN (:...businessIds)', { businessIds })
      .andWhere('tx.category = :cat', {
        cat: TransactionCategory.INTERNAL_TRANSFER,
      })
      .andWhere('tx.direction = :dir', { dir: TransactionDirection.CREDIT })
      .andWhere('tx.subCategory = :sub', { sub: 'Owner Injection (Capital)' })
      .select('SUM(tx.amount)', 'total')
      .getRawOne();

    const totalCapital = parseFloat(capitalContrib?.total || '0');

    const drawings = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId IN (:...businessIds)', { businessIds })
      .andWhere('tx.category = :cat', {
        cat: TransactionCategory.INTERNAL_TRANSFER,
      })
      .andWhere('tx.direction = :dir', { dir: TransactionDirection.DEBIT })
      .andWhere('tx.subCategory = :sub', { sub: 'Owner Withdrawal (Drawing)' })
      .select('SUM(tx.amount)', 'total')
      .getRawOne();

    const totalDrawings = parseFloat(drawings?.total || '0');

    const pnlResults = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId IN (:...businessIds)', { businessIds })
      .andWhere('tx.isCategorised = :isCat', { isCat: true })
      .andWhere('tx.category != :internalTransfer', {
        internalTransfer: TransactionCategory.INTERNAL_TRANSFER,
      })
      .select('tx.category', 'category')
      .addSelect('SUM(tx.amount)', 'total')
      .groupBy('tx.category')
      .getRawMany();

    let allTimeRevenue = 0;
    let allTimeCogs = 0;
    let allTimeExpenses = 0;

    for (const r of pnlResults) {
      const amount = parseFloat(r.total);
      if (r.category === TransactionCategory.INCOME) allTimeRevenue += amount;
      if (r.category === TransactionCategory.COGS) allTimeCogs += amount;
      if (r.category === TransactionCategory.EXPENSE) allTimeExpenses += amount;
    }

    const retainedProfit = allTimeRevenue - allTimeCogs - allTimeExpenses;

    const ownersMoney = totalCapital + retainedProfit - totalDrawings;

    return {
      assets: {
        cashAndBankBalances,
        businessAssets,
        totalAssets,
      },
      liabilities: {
        totalLiabilities,
      },
      equity: {
        capitalContributed: totalCapital,
        retainedProfit,
        ownerWithdrawals: totalDrawings,
        ownersMoney,
      },
      integrityCheck: {
        difference: Math.abs(totalAssets - (totalLiabilities + ownersMoney)),
        isValid: Math.abs(totalAssets - (totalLiabilities + ownersMoney)) <= 1,
      },
    };
  }

  private emptyBalanceSheet() {
    return {
      assets: { cashAndBankBalances: 0, businessAssets: 0, totalAssets: 0 },
      liabilities: { totalLiabilities: 0 },
      equity: {
        capitalContributed: 0,
        retainedProfit: 0,
        ownerWithdrawals: 0,
        ownersMoney: 0,
      },
      integrityCheck: { difference: 0, isValid: true },
    };
  }
}
