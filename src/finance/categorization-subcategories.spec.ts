import { normalizeCategorizationSubCategory } from './categorization-subcategories';

describe('normalizeCategorizationSubCategory', () => {
  it.each([
    ['Salary and Wages', 'Salaries & Wages'],
    ['Wages & Salaries', 'Salaries & Wages'],
    ['Airtime/Internet Subscription', 'Airtime/Data Subscription'],
    [
      'Utility Bill (Light, Water, Waste etc.)',
      'Utlity Bill (Light, Water, Waste etc.)',
    ],
    ['Subscriptions', 'Subscription - Capcut, Captions etc.'],
    ['Personal use', 'Personal Use'],
  ])('maps %s to %s', (value, expected) => {
    expect(normalizeCategorizationSubCategory(value)).toBe(expected);
  });

  it('preserves unknown subcategories after trimming whitespace', () => {
    expect(normalizeCategorizationSubCategory('  Bank Charges  ')).toBe(
      'Bank Charges',
    );
  });
});
