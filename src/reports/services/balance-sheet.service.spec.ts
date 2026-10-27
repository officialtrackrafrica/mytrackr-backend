import { BalanceSheetService } from './balance-sheet.service';

describe('BalanceSheetService CSV export', () => {
  it('exports the current user report with escaped labels and reconciliation', async () => {
    const service = new BalanceSheetService(
      null!,
      null!,
      null!,
      null!,
      null!,
      null!,
    );
    const calculate = jest.spyOn(service, 'calculateBalanceSheet');
    calculate.mockResolvedValue({
      assets: {
        bankAccounts: [{ id: 'bank', name: 'Bank, "Main"', balance: 100 }],
        cashAndBankBalances: 100,
        businessAssets: [
          { id: 'asset', name: '=SUM(1)', category: 'Equipment', value: 50 },
        ],
        businessAssetsTotal: 50,
        totalAssets: 150,
      },
      liabilities: {
        activeLiabilities: [
          { id: 'debt', name: 'Loan\nOne', category: 'Loan', amountOwed: 20 },
        ],
        totalLiabilities: 20,
      },
      equity: {
        capitalContributed: 100,
        retainedProfit: -10,
        ownerWithdrawals: 5,
        recordedEquity: 85,
        equityReconciliation: 45,
        ownersEquity: 130,
      },
      integrityCheck: { difference: 0, recordedDifference: 45, isValid: true },
    } as Awaited<ReturnType<BalanceSheetService['calculateBalanceSheet']>>);

    const csv = await service.generateBalanceSheetCsv('user-1');

    expect(calculate).toHaveBeenCalledWith('user-1');
    expect(csv).toContain('"Bank, ""Main""",Cash and Bank,100');
    expect(csv).toContain("'=SUM(1),Equipment,50");
    expect(csv).toContain('"Loan\nOne",Loan,20');
    expect(csv).toContain('Total Assets,,150');
    expect(csv).toContain('Total Liabilities,,20');
    expect(csv).toContain('Retained Profit,-10');
    expect(csv).toContain('Equity Reconciliation,45');
    expect(csv).toContain('Total Owner Equity,130');
  });
});
