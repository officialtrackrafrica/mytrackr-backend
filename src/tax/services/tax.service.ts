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

export interface UserTaxDeductions {
  healthInsurance?: number;
  lifeInsurance?: number;
  pension?: number;
  housingFund?: number;
  rent?: number;
  extra?: number;
}

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
    userDeductions: number | UserTaxDeductions = 0,
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    const assets = await this.assetRepository.find({
      where: { businessId, isArchived: false },
    });
    const totalAssets = assets.reduce(
      (acc, asset) => acc + Number(asset.currentValue || asset.purchaseValue),
      0,
    );

    const currentPeriod = await this.buildTaxPeriodEstimate(
      businessId,
      this.getYearToDateRange(year),
      userDeductions,
      totalAssets,
    );

    const previousMonthRange = this.getPreviousMonthYearToDateRange(year);
    const previousMonth = previousMonthRange
      ? await this.buildTaxPeriodEstimate(
          businessId,
          previousMonthRange,
          userDeductions,
          totalAssets,
        )
      : null;

    return {
      year,
      period: currentPeriod.period,
      netProfit: currentPeriod.netProfit,
      totalRevenue: currentPeriod.totalRevenue,
      totalExpenses: currentPeriod.totalExpenses,
      totalCogs: currentPeriod.totalCogs,
      totalAssets,
      projection: null,
      deductions: currentPeriod.deductions,
      taxableProfit: currentPeriod.taxableProfit,
      pitCalculation: currentPeriod.pitCalculation,
      citCalculation: currentPeriod.citCalculation,
      previousMonth,
    };
  }

  private async buildTaxPeriodEstimate(
    businessId: string,
    period: {
      year: number;
      month: number | null;
      startDate: Date;
      endDate: Date;
    },
    userDeductions: number | UserTaxDeductions,
    totalAssets: number,
  ) {
    const pnlSummary = await this.pnlService.getCategorisedSummary(
      businessId,
      period.startDate,
      period.endDate,
    );
    const deductionTotals = await this.getDeductionTotals(
      businessId,
      period.startDate,
      period.endDate,
      userDeductions,
    );
    const pitCalculation = this.calculatePIT(
      pnlSummary.netProfit,
      pnlSummary.totalRevenue,
      deductionTotals.total,
    );

    return {
      period: {
        year: period.year,
        month: period.month,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
      netProfit: pnlSummary.netProfit,
      totalRevenue: pnlSummary.totalRevenue,
      totalExpenses: pnlSummary.totalExpenses,
      totalCogs: pnlSummary.totalCogs,
      deductions: deductionTotals,
      taxableProfit: Math.max(0, pnlSummary.netProfit - deductionTotals.total),
      pitCalculation,
      citCalculation: this.calculateCIT(
        pnlSummary.totalRevenue,
        pnlSummary.netProfit,
        deductionTotals.total,
        totalAssets,
      ),
    };
  }

  private getYearToDateRange(year: number) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const isSelectedYear = year === now.getFullYear();

    return {
      year,
      month: isSelectedYear ? currentMonth + 1 : null,
      startDate: new Date(year, 0, 1),
      endDate: isSelectedYear
        ? new Date(year, currentMonth, now.getDate(), 23, 59, 59, 999)
        : new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }

  private getPreviousMonthYearToDateRange(year: number) {
    const now = new Date();
    const currentMonth = now.getMonth();

    if (year !== now.getFullYear() || currentMonth === 0) return null;

    return {
      year,
      month: currentMonth,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, currentMonth, 0, 23, 59, 59, 999),
    };
  }

  private async getDeductionTotals(
    businessId: string,
    startDate: Date,
    endDate: Date,
    userDeductions: number | UserTaxDeductions,
  ) {
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
      .andWhere("LOWER(COALESCE(tx.subCategory, '')) LIKE :rentPattern", {
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

    const transactionDeductions = {
      healthInsurance:
        deductionsMap.hmo +
        deductionsMap.nhis +
        deductionsMap['national health insurance scheme'],
      lifeInsurance:
        deductionsMap['life insurance'] + deductionsMap['life assurance'],
      pension: deductionsMap.pension,
      housingFund: deductionsMap.nhf + deductionsMap['national housing fund'],
      rent: this.calculateRentRelief(parseFloat(rentExpenseResult?.total || '0')),
    };

    const explicitDeductions =
      typeof userDeductions === 'number'
        ? {
            healthInsurance: 0,
            lifeInsurance: 0,
            pension: 0,
            housingFund: 0,
            rent: 0,
            extra: userDeductions,
          }
        : {
            healthInsurance: Number(userDeductions.healthInsurance || 0),
            lifeInsurance: Number(userDeductions.lifeInsurance || 0),
            pension: Number(userDeductions.pension || 0),
            housingFund: Number(userDeductions.housingFund || 0),
            rent: Number(userDeductions.rent || 0),
            extra: Number(userDeductions.extra || 0),
          };

    const healthInsurance =
      explicitDeductions.healthInsurance ||
      transactionDeductions.healthInsurance;
    const lifeInsurance =
      explicitDeductions.lifeInsurance || transactionDeductions.lifeInsurance;
    const pension = explicitDeductions.pension || transactionDeductions.pension;
    const housingFund =
      explicitDeductions.housingFund || transactionDeductions.housingFund;
    const rent =
      explicitDeductions.rent > 0
        ? this.calculateRentRelief(explicitDeductions.rent)
        : transactionDeductions.rent;
    const extra = explicitDeductions.extra;

    return {
      healthInsurance,
      lifeInsurance,
      pension,
      housingFund,
      rent,
      extra,
      total:
        healthInsurance +
        lifeInsurance +
        pension +
        housingFund +
        rent +
        extra,
    };
  }

  /**
   * Sole Proprietor / Business Name (Nigeria Tax Act 2025 / 2026 regime)
   */
  calculatePIT(netProfit: number, grossIncome: number, deductions: number) {
    const consolidatedReliefAllowance = 0;
    const chargeableIncome = Math.max(0, netProfit - deductions);
    let remaining = chargeableIncome;
    let totalTax = 0;

    const bands = [
      { width: 800000, rate: 0, label: 'First 800,000' },
      { width: 2200000, rate: 0.15, label: 'Next 2,200,000' },
      { width: 9000000, rate: 0.18, label: 'Next 9,000,000' },
      { width: 13000000, rate: 0.21, label: 'Next 13,000,000' },
      { width: 25000000, rate: 0.23, label: 'Next 25,000,000' },
      { width: Infinity, rate: 0.25, label: 'Above 50,000,000' },
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
      minimumTaxApplied:
        estimatedAnnualTax === minimumTax && minimumTax > totalTax,
      breakdown,
    };
  }

  private calculateRentRelief(rentPaid: number) {
    return Math.min(Math.max(0, rentPaid) * 0.2, 500000);
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
      previousMonth: null,
      pitCalculation: this.calculatePIT(0, 0, 0),
      citCalculation: this.calculateCIT(0, 0, 0, 0),
    };
  }
}
