import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset, AssetCategory } from '../../finance/entities/asset.entity';
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
import { BusinessService } from '../../business/services/business.service';
import { PnlService } from './pnl.service';

@Injectable()
export class BalanceSheetService {
  private readonly logger = new Logger(BalanceSheetService.name);
  private static readonly INVENTORY_UPDATE_PROMPT =
    'When did you last update your stock value? Tap here to update it.';

  constructor(
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Liability)
    private readonly liabilityRepository: Repository<Liability>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly businessService: BusinessService,
    private readonly pnlService: PnlService,
  ) {}

  async calculateBalanceSheet(userId: string) {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    const bankAccounts = await this.bankAccountRepository.find({
      where: { businessId },
    });
    const cashAndBankBalances = bankAccounts.reduce(
      (acc, account) => acc + Number(account.currentBalance),
      0,
    );

    const assets = await this.assetRepository.find({
      where: { businessId, isArchived: false },
    });
    const businessAssets = assets.reduce(
      (acc, asset) => acc + this.getAssetDisplayValue(asset),
      0,
    );
    const inventoryAssets = assets.filter(
      (asset) => asset.category === AssetCategory.INVENTORY,
    );
    const latestInventoryUpdate = this.getLatestInventoryUpdate(inventoryAssets);

    const totalAssets = cashAndBankBalances + businessAssets;

    const liabilities = await this.liabilityRepository.find({
      where: { businessId, status: LiabilityStatus.ACTIVE },
    });
    const totalLiabilities = liabilities.reduce(
      (acc, liability) => acc + Number(liability.amountOwed),
      0,
    );

    const capitalContrib = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.category = :cat', {
        cat: TransactionCategory.EQUITY,
      })
      .andWhere('tx.direction = :dir', { dir: TransactionDirection.CREDIT })
      .andWhere('tx.subCategory = :sub', { sub: 'Capital contributed' })
      .select('SUM(tx.amount)', 'total')
      .getRawOne();

    const totalCapital = parseFloat(capitalContrib?.total || '0');

    const drawings = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.category = :cat', {
        cat: TransactionCategory.EQUITY,
      })
      .andWhere('tx.direction = :dir', { dir: TransactionDirection.DEBIT })
      .andWhere('tx.subCategory = :sub', {
        sub: 'Owner Withdrawal (for personal use)',
      })
      .select('SUM(tx.amount)', 'total')
      .getRawOne();

    const totalDrawings = parseFloat(drawings?.total || '0');

    const businessStartDate = new Date('2000-01-01T00:00:00.000Z');
    const today = new Date();
    const pnlSummary = await this.pnlService.getCategorisedSummary(
      businessId,
      businessStartDate,
      today,
    );

    const retainedProfit = pnlSummary.netProfit;
    const ownerInvestments = totalCapital;
    const ownerWithdrawals = totalDrawings;
    const ownersEquity = ownerInvestments + retainedProfit - ownerWithdrawals;
    const accountingDifference = Math.abs(
      totalAssets - (totalLiabilities + ownersEquity),
    );

    return {
      summary: {
        totalAssets,
        totalLiabilities,
        ownersEquity,
        cashAvailable: cashAndBankBalances,
        businessPropertiesAndValuables: businessAssets,
        outstandingDebts: totalLiabilities,
        ownerInvestments,
        retainedProfits: retainedProfit,
        ownerWithdrawals,
      },
      assets: {
        bankAccounts: bankAccounts.map((a) => ({
          id: a.id,
          name: a.bankName,
          balance: Number(a.currentBalance),
        })),
        cashAndBankBalances,
        businessAssets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          category: a.category,
          value: this.getAssetDisplayValue(a),
        })),
        businessAssetsTotal: businessAssets,
        totalAssets,
        inventoryReminder: latestInventoryUpdate
          ? {
              prompt: BalanceSheetService.INVENTORY_UPDATE_PROMPT,
              assetId: latestInventoryUpdate.id,
              assetName: latestInventoryUpdate.name,
              lastUpdatedAt: latestInventoryUpdate.updatedAt,
            }
          : null,
      },
      liabilities: {
        activeLiabilities: liabilities.map((l) => ({
          id: l.id,
          name: l.name,
          category: l.liabilityType,
          amountOwed: Number(l.amountOwed),
        })),
        totalLiabilities,
      },
      equity: {
        capitalContributed: ownerInvestments,
        ownerInvestments,
        retainedProfit,
        retainedProfits: retainedProfit,
        ownerWithdrawals,
        ownersEquity,
        ownersMoney: ownersEquity,
      },
      integrityCheck: {
        equation: 'Assets = Liabilities + Owner’s Equity',
        difference: accountingDifference,
        isValid: accountingDifference <= 1,
      },
    };
  }

  private emptyBalanceSheet() {
    return {
      assets: {
        cashAndBankBalances: 0,
        businessAssets: 0,
        totalAssets: 0,
        inventoryReminder: null,
      },
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

  private getAssetDisplayValue(asset: Asset) {
    return Number(asset.currentValue ?? asset.purchaseValue);
  }

  private getLatestInventoryUpdate(assets: Asset[]) {
    return assets.reduce<Asset | null>((latest, asset) => {
      if (!latest) {
        return asset;
      }

      return asset.updatedAt > latest.updatedAt ? asset : latest;
    }, null);
  }
}
