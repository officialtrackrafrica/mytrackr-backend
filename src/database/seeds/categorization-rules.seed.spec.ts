import { AccountCategoryType } from '../../finance/entities/account-category.entity';
import { MatchType } from '../../finance/entities/categorization-rule.entity';
import { DEFAULT_CATEGORIZATION_RULES } from './categorization-rules.seed';

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
});
