import { AccountCategoryType } from '../../finance/entities/account-category.entity';
import { MatchType } from '../../finance/entities/categorization-rule.entity';
import {
  CategorizationRulesSeed,
  DEFAULT_CATEGORIZATION_RULES,
} from './categorization-rules.seed';

describe('DEFAULT_CATEGORIZATION_RULES', () => {
  it.each([
    [MatchType.CONTAINS, 'vat'],
    [MatchType.REGEX, '\\bcomm\\b'],
    [MatchType.CONTAINS, 'commission'],
    [MatchType.CONTAINS, 'stamp duty'],
    [MatchType.CONTAINS, 'stamp duties'],
  ])('maps %s %s to bank charges', (matchType, matchValue) => {
    expect(DEFAULT_CATEGORIZATION_RULES).toContainEqual(
      expect.objectContaining({
        matchType,
        matchValue,
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Bank Charges',
      }),
    );
  });

  it('normalizes legacy subcategories and removes duplicate keyword rules', async () => {
    const legacy = {
      id: 'legacy',
      isSystem: true,
      matchType: MatchType.CONTAINS,
      matchValue: 'salary',
      category: AccountCategoryType.EXPENSE,
      subCategory: 'Salary and Wages',
      priority: 20,
      isActive: true,
      businessId: null,
      createdAt: new Date('2026-01-01'),
    };
    const duplicate = {
      ...legacy,
      id: 'duplicate',
      subCategory: 'Wages & Salaries',
      priority: 25,
      createdAt: new Date('2026-01-02'),
    };
    const ruleRepo = {
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([legacy, duplicate]),
      findOne: jest.fn().mockResolvedValue({ id: 'existing' }),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn().mockImplementation(async (value) => value),
      create: jest.fn().mockImplementation((value) => value),
    };
    const transactionRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    await new CategorizationRulesSeed(
      ruleRepo as any,
      transactionRepo as any,
    ).run();

    expect(legacy.subCategory).toBe('Salaries & Wages');
    expect(ruleRepo.save).toHaveBeenCalledWith([legacy]);
    expect(transactionRepo.update).toHaveBeenCalledWith(
      { ruleId: duplicate.id },
      { ruleId: legacy.id },
    );
    expect(ruleRepo.remove).toHaveBeenCalledWith([duplicate]);
  });
});
