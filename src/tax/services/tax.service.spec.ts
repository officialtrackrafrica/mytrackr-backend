import { TaxService } from './tax.service';

describe('TaxService', () => {
  let service: TaxService;

  beforeEach(() => {
    service = new TaxService({} as any, {} as any, {} as any, {} as any);
  });

  it('calculates PIT using consolidated relief and the official progressive bands', () => {
    const result = service.calculatePIT(5_000_000, 5_000_000, 0);

    expect(result.chargeableIncome).toBe(3_800_000);
    expect(result.consolidatedReliefAllowance).toBe(1_200_000);
    expect(result.estimatedAnnualTax).toBe(704_000);
    expect(result.estimatedMonthlySetAside).toBeCloseTo(58_666.6667, 4);
    expect(result.minimumTaxFloor).toBe(50_000);
    expect(result.minimumTaxApplied).toBe(false);
    expect(result.breakdown).toEqual([
      {
        bandLimit: 'First 300,000',
        rate: '7%',
        taxableAmount: 300_000,
        taxGenerated: 21_000,
      },
      {
        bandLimit: 'Next 300,000',
        rate: '11%',
        taxableAmount: 300_000,
        taxGenerated: 33_000,
      },
      {
        bandLimit: 'Next 500,000',
        rate: '15%',
        taxableAmount: 500_000,
        taxGenerated: 75_000,
      },
      {
        bandLimit: 'Next 500,000',
        rate: '19%',
        taxableAmount: 500_000,
        taxGenerated: 95_000,
      },
      {
        bandLimit: 'Next 1,600,000',
        rate: '21%',
        taxableAmount: 1_600_000,
        taxGenerated: 336_000,
      },
      {
        bandLimit: 'Above 3,200,000',
        rate: '24%',
        taxableAmount: 600_000,
        taxGenerated: 144_000,
      },
    ]);
  });

  it('applies the minimum tax floor when the computed PIT is lower', () => {
    const result = service.calculatePIT(250_000, 1_000_000, 300_000);

    expect(result.chargeableIncome).toBe(0);
    expect(result.estimatedAnnualTax).toBe(10_000);
    expect(result.estimatedMonthlySetAside).toBeCloseTo(833.3333, 4);
    expect(result.minimumTaxFloor).toBe(10_000);
    expect(result.minimumTaxApplied).toBe(true);
    expect(result.breakdown).toEqual([]);
  });

  it('classifies CIT using the official gross-turnover thresholds', () => {
    expect(service.calculateCIT(25_000_000, 5_000_000, 0).taxRateApplied).toBe(
      '0%',
    );
    expect(service.calculateCIT(25_000_001, 5_000_000, 0).taxRateApplied).toBe(
      '20%',
    );
    expect(service.calculateCIT(100_000_000, 5_000_000, 0).taxRateApplied).toBe(
      '30%',
    );
  });

  it('calculates current year-to-date and previous-month year-to-date estimates', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 26, 12));

    const businessService = {
      getBusinessIdForUser: jest.fn().mockResolvedValue('business-id'),
    };
    const assetRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    };
    const transactionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const pnlService = {
      getCategorisedSummary: jest.fn().mockResolvedValue({
        netProfit: 100_000,
        totalRevenue: 200_000,
        totalExpenses: 50_000,
        totalCogs: 50_000,
      }),
    };

    service = new TaxService(
      businessService as any,
      transactionRepository as any,
      assetRepository as any,
      pnlService as any,
    );

    const result = await service.calculateTaxEstimate('user-id', 2026, 0);

    expect(pnlService.getCategorisedSummary).toHaveBeenNthCalledWith(
      1,
      'business-id',
      new Date(2026, 0, 1),
      new Date(2026, 5, 26, 23, 59, 59, 999),
    );
    expect(pnlService.getCategorisedSummary).toHaveBeenNthCalledWith(
      2,
      'business-id',
      new Date(2026, 0, 1),
      new Date(2026, 5, 0, 23, 59, 59, 999),
    );
    expect(result.period).toEqual({
      year: 2026,
      month: 6,
      startDate: new Date(2026, 0, 1).toISOString(),
      endDate: new Date(2026, 5, 26, 23, 59, 59, 999).toISOString(),
    });
    expect(result.previousMonth?.period).toEqual({
      year: 2026,
      month: 5,
      startDate: new Date(2026, 0, 1).toISOString(),
      endDate: new Date(2026, 5, 0, 23, 59, 59, 999).toISOString(),
    });

    jest.useRealTimers();
  });
});
