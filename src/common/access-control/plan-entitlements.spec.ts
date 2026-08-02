import {
  getPlanBankAccountLimit,
  planHasCapability,
} from './plan-entitlements';

describe('plan entitlements', () => {
  const plan = {
    slug: 'solo',
    name: 'Solo',
    features: ['all_financial_reports'],
  };

  it('uses a legacy feature when no explicit capability exists', () => {
    expect(planHasCapability(plan, 'all_financial_reports')).toBe(true);
  });

  it('lets an explicit false capability override a legacy feature', () => {
    expect(
      planHasCapability(
        {
          ...plan,
          capabilities: { all_financial_reports: false },
        },
        'all_financial_reports',
      ),
    ).toBe(false);
  });

  it('treats a bank account limit of -1 as unlimited', () => {
    expect(
      getPlanBankAccountLimit({
        ...plan,
        capabilities: { bankAccountLimit: -1 },
      }),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
