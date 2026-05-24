import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessService } from '../../business/services/business.service';
import {
  Transaction,
  TransactionCategory,
} from '../../finance/entities/transaction.entity';
import { Asset } from '../../finance/entities/asset.entity';
import { PnlService } from '../../reports/services/pnl.service';

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(
    private readonly businessService: BusinessService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    private readonly pnlService: PnlService,
  ) {}

  async calculateTaxEstimate(
    userId: string,
    year: number,
    userDeductions: number = 0,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const pnlSummary = await this.pnlService.getCategorisedSummary(
      businessId,
      startDate,
      endDate,
    );
    const totalRevenue = pnlSummary.totalRevenue;
    const netProfit = pnlSummary.netProfit;

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

    const deductionsResults = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.category = :expense', {
        expense: TransactionCategory.EXPENSE,
      })
      .andWhere('LOWER(tx.subCategory) IN (:...deductions)', {
        deductions: [
          'hmo',
          'nhis',
          'national health insurance scheme',
          'life insurance',
          'life assurance',
          'pension',
          'nhf',
          'national housing fund',
        ],
      })
      .select('tx.subCategory', 'subCategory')
      .addSelect('SUM(tx.amount)', 'total')
      .groupBy('tx.subCategory')
      .getRawMany();

    const rentExpenseResult = await this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.category = :expense', {
        expense: TransactionCategory.EXPENSE,
      })
      .andWhere('LOWER(COALESCE(tx.subCategory, \'\')) LIKE :rentPattern', {
        rentPattern: '%rent%',
      })
      .select('COALESCE(SUM(tx.amount), 0)', 'total')
      .getRawOne();

    const deductionsMap: Record<string, number> = {
      hmo: 0,
      nhis: 0,
      'national health insurance scheme': 0,
      'life insurance': 0,
      'life assurance': 0,
      pension: 0,
      nhf: 0,
      'national housing fund': 0,
    };

    let totalDeductions = 0;
    deductionsResults.forEach((d) => {
      const sub = d.subCategory.toLowerCase();
      const amount = parseFloat(d.total);
      deductionsMap[sub] = amount;
      totalDeductions += amount;
    });

    const totalHealthInsurance =
      deductionsMap.hmo +
      deductionsMap.nhis +
      deductionsMap['national health insurance scheme'];
    const totalLifeInsurance =
      deductionsMap['life insurance'] + deductionsMap['life assurance'];
    const totalHousingFund =
      deductionsMap.nhf + deductionsMap['national housing fund'];
    const rentExpense = parseFloat(rentExpenseResult?.total || '0');

    const pitCalculation = this.calculatePIT(
      projectedNetProfit,
      totalRevenue,
      totalDeductions + userDeductions,
    );

    return {
      year,
      netProfit,
      totalRevenue,
      totalExpenses: pnlSummary.totalExpenses,
      totalCogs: pnlSummary.totalCogs,
      totalAssets,
      projection: isProjection
        ? {
            monthsElapsed: now.getMonth() + 1,
            projectedAnnualNetProfit: projectedNetProfit,
          }
        : null,
      deductions: {
        healthInsurance: totalHealthInsurance,
        lifeInsurance: totalLifeInsurance,
        pension: deductionsMap.pension,
        housingFund: totalHousingFund,
        rent: rentExpense,
        extra: userDeductions,
        total: totalDeductions + userDeductions,
      },
      taxableProfit: Math.max(0, projectedNetProfit - (totalDeductions + userDeductions)),
      pitCalculation,
      citCalculation: this.calculateCIT(
        totalRevenue,
        projectedNetProfit,
        totalDeductions + userDeductions,
        totalAssets,
      ),
    };
  }

  /**
   * Sole Proprietor / Business Name (Nigeria Tax Act 2025)
   */
  calculatePIT(netProfit: number, grossIncome: number, deductions: number) {
    const consolidatedReliefAllowance = 200000 + netProfit * 0.2;
    const chargeableIncome = Math.max(
      0,
      netProfit - deductions - consolidatedReliefAllowance,
    );
    let remaining = chargeableIncome;
    let totalTax = 0;

    const bands = [
      { width: 300000, rate: 0.07, label: 'First 300,000' },
      { width: 300000, rate: 0.11, label: 'Next 300,000' },
      { width: 500000, rate: 0.15, label: 'Next 500,000' },
      { width: 500000, rate: 0.19, label: 'Next 500,000' },
      { width: 1600000, rate: 0.21, label: 'Next 1,600,000' },
      { width: Infinity, rate: 0.24, label: 'Above 3,200,000' },
    ];

    const breakdown: {
      bandLimit: string;
      rate: string;
      taxableAmount: number;
      taxGenerated: number;
    }[] = [];

    for (const band of bands) {
      const taxableInBand = Math.min(remaining, band.width);
      const taxOnBand = taxableInBand * band.rate;

      if (taxableInBand > 0) {
        breakdown.push({
          bandLimit: band.label,
          rate: `${Number((band.rate * 100).toFixed(2))}%`,
          taxableAmount: taxableInBand,
          taxGenerated: Number(taxOnBand.toFixed(2)),
        });
      }

      totalTax += taxOnBand;
      remaining -= taxableInBand;

      if (remaining <= 0) break;
    }

    const minimumTax = grossIncome > 0 ? grossIncome * 0.01 : 0;
    const estimatedAnnualTax = Math.max(totalTax, minimumTax);

    return {
      chargeableIncome,
      consolidatedReliefAllowance,
      estimatedAnnualTax,
      estimatedMonthlySetAside: estimatedAnnualTax / 12,
      minimumTaxFloor: minimumTax,
      minimumTaxApplied: estimatedAnnualTax === minimumTax && minimumTax > totalTax,
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

    if (totalRevenue >= 100000000) {
      taxRate = 0.3;
      companySize = 'Large Company';
    } else if (totalRevenue > 25000000) {
      taxRate = 0.2;
      companySize = 'Medium Company';
    }

    const estimatedAnnualTax = assessableProfit * taxRate;

    return {
      companySize,
      companyCategory: companySize,
      assessableProfit,
      estimatedTaxableProfit: assessableProfit,
      taxRateApplied: `${taxRate * 100}%`,
      estimatedAnnualTax,
      estimatedMonthlySetAside: estimatedAnnualTax / 12,
      isExempt: taxRate === 0,
      totalAssetsConsidered: totalAssets,
    };
  }

  private emptyTaxEstimate() {
    return {
      netProfit: 0,
      totalRevenue: 0,
      totalAssets: 0,
      projection: null,
      pitCalculation: this.calculatePIT(0, 0, 0),
      citCalculation: this.calculateCIT(0, 0, 0, 0),
    };
  }
}
