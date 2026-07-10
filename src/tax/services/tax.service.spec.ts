import { TaxService } from './tax.service';

describe('TaxService', () => {
  let service: TaxService;

  beforeEach(() => {
    service = new TaxService({} as any, {} as any, {} as any, {} as any);
  });

  it('calculates PIT using the 2026 progressive bands without consolidated relief', () => {
    const result = service.calculatePIT(5_000_000, 5_000_000, 0);

    expect(result.chargeableIncome).toBe(5_000_000);
    expect(result.consolidatedReliefAllowance).toBe(0);
    expect(result.estimatedAnnualTax).toBe(690_000);
    expect(result.estimatedMonthlySetAside).toBeCloseTo(57_500, 4);
    expect(result.minimumTaxFloor).toBe(50_000);
    expect(result.minimumTaxApplied).toBe(false);
    expect(result.breakdown).toEqual([
      {
        bandLimit: 'First 800,000',
        rate: '0%',
        taxableAmount: 800_000,
        taxGenerated: 0,
      },
      {
        bandLimit: 'Next 2,200,000',
        rate: '15%',
        taxableAmount: 2_200_000,
        taxGenerated: 330_000,
      },
      {
        bandLimit: 'Next 9,000,000',
        rate: '18%',
        taxableAmount: 2_000_000,
        taxGenerated: 360_000,
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

  it('caps rent relief at 20% of rent paid up to 500,000 while keeping the rent field', async () => {
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
      getRawOne: jest.fn().mockResolvedValue({ total: '3000000' }),
    };
    const transactionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const pnlService = {
      getCategorisedSummary: jest.fn().mockResolvedValue({
        netProfit: 5_000_000,
        totalRevenue: 5_000_000,
        totalExpenses: 0,
        totalCogs: 0,
      }),
    };

    service = new TaxService(
      businessService as any,
      transactionRepository as any,
      assetRepository as any,
      pnlService as any,
    );

    const result = await service.calculateTaxEstimate('user-id', 2026, 0);

    expect(result.deductions.rent).toBe(500_000);
    expect(result.deductions.total).toBe(500_000);
    expect(result.pitCalculation.chargeableIncome).toBe(4_500_000);

    jest.useRealTimers();
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
