import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import {
  Transaction,
  TransactionCategory,
} from '../../finance/entities/transaction.entity';
import { Asset } from '../../finance/entities/asset.entity';

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
  ) {}

  async calculateTaxEstimate(
    userId: string,
    businessId: string,
    year: number,
    userDeductions: number = 0,
  ) {
    if (!businessId) {
      throw new BadRequestException('businessId is required');
    }

    const business = await this.businessRepository.findOne({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    if (business.userId !== userId) {
      throw new ForbiddenException('You do not have access to this business');
    }

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const pnlResults = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.isCategorised = :isCat', { isCat: true })
      .andWhere('tx.category != :internalTransfer', {
        internalTransfer: TransactionCategory.INTERNAL_TRANSFER,
      })
      .select('tx.category', 'category')
      .addSelect('SUM(tx.amount)', 'total')
      .groupBy('tx.category')
      .getRawMany();

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    for (const r of pnlResults) {
      const amount = parseFloat(r.total);
      if (r.category === TransactionCategory.INCOME) totalRevenue += amount;
      if (r.category === TransactionCategory.COGS) totalCogs += amount;
      if (r.category === TransactionCategory.EXPENSE) totalExpenses += amount;
    }

    const netProfit = totalRevenue - totalCogs - totalExpenses;

    const assets = await this.assetRepository.find({
      where: { businessId, isArchived: false },
    });
    const totalAssets = assets.reduce(
      (acc, asset) => acc + Number(asset.currentValue || asset.purchaseValue),
      0,
    );

    const now = new Date();
    const currentYear = now.getFullYear();
    let projectedNetProfit = netProfit;
    let isProjection = false;

    if (year === currentYear) {
      const monthsElapsed = now.getMonth() + 1; // Jan = 1, Dec = 12
      if (monthsElapsed < 12) {
        projectedNetProfit = netProfit * (12 / monthsElapsed);
        isProjection = true;
      }
    }

    return {
      netProfit,
      totalRevenue,
      totalAssets,
      projection: isProjection
        ? {
            monthsElapsed: now.getMonth() + 1,
            projectedAnnualNetProfit: projectedNetProfit,
          }
        : null,
      pitCalculation: this.calculatePIT(projectedNetProfit, userDeductions),
      citCalculation: this.calculateCIT(
        totalRevenue,
        projectedNetProfit,
        userDeductions,
        totalAssets,
      ),
    };
  }

  /**
   * Sole Proprietor / Business Name (Nigeria Tax Act 2025)
   */
  calculatePIT(netProfit: number, deductions: number) {
    const chargeableIncome = Math.max(0, netProfit - deductions);
    let remaining = chargeableIncome;
    let totalTax = 0;

    const bands = [
      { limit: 800000, rate: 0.0 },
      { limit: 2200000, rate: 0.15 },
      { limit: 9000000, rate: 0.18 },
      { limit: 13000000, rate: 0.21 },
      { limit: 25000000, rate: 0.23 },
      { limit: Infinity, rate: 0.25 },
    ];

    const breakdown: {
      bandLimit: string | number;
      rate: string;
      taxableAmount: number;
      taxGenerated: number;
    }[] = [];

    for (const band of bands) {
      const taxableInBand = Math.min(remaining, band.limit);
      const taxOnBand = taxableInBand * band.rate;

      if (taxableInBand > 0) {
        breakdown.push({
          bandLimit: band.limit === Infinity ? 'Above 50,000,000' : band.limit,
          rate: `${band.rate * 100}%`,
          taxableAmount: taxableInBand,
          taxGenerated: taxOnBand,
        });
      }

      totalTax += taxOnBand;
      remaining -= taxableInBand;

      if (remaining <= 0) break;
    }

    return {
      chargeableIncome,
      estimatedAnnualTax: totalTax,
      estimatedMonthlySetAside: totalTax / 12,
      breakdown,
    };
  }

  /**
   * Limited Liability Company (LLC)
   * Small (<=50m revenue AND <=250m assets) = 0%
   * Medium (50m - 100m revenue) = 20%
   * Large (>100m revenue) = 30%
   */
  calculateCIT(
    totalRevenue: number,
    netProfit: number,
    deductions: number,
    totalAssets: number = 0,
  ) {
    const assessableProfit = Math.max(0, netProfit - deductions);
    let taxRate = 0;
    let companySize = 'Small Company';

    if (totalRevenue > 100000000) {
      taxRate = 0.3;
      companySize = 'Large Company';
    } else if (totalRevenue > 50000000) {
      taxRate = 0.2;
      companySize = 'Medium Company';
    } else if (totalAssets > 250000000) {
      taxRate = 0.2;
      companySize = 'Medium Company';
    }

    const estimatedAnnualTax = assessableProfit * taxRate;

    return {
      companySize,
      assessableProfit,
      taxRateApplied: `${taxRate * 100}%`,
      estimatedAnnualTax,
      estimatedMonthlySetAside: estimatedAnnualTax / 12,
      isExempt: taxRate === 0,
      totalAssetsConsidered: totalAssets,
    };
  }
}
