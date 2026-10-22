import {
  AccountingTreatment,
  getAccountingTreatment,
  isOperatingExpense,
} from './accounting-treatment';
import {
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { SubCategoryAccountingType } from '../../finance/entities/account-subcategory.entity';

const transaction = (overrides: Record<string, unknown> = {}) =>
  ({
    isCategorised: true,
    category: TransactionCategory.TRANSFER,
    subCategory: 'Transfer from other business account',
    direction: TransactionDirection.CREDIT,
    description: '',
    name: '',
    ...overrides,
  }) as any;

describe('getAccountingTreatment', () => {
  it('keeps a genuine bank-to-bank movement as an internal transfer', () => {
    expect(getAccountingTreatment(transaction())).toBe(
      AccountingTreatment.INTERNAL_TRANSFER,
    );
  });

  it('uses stable subcategory metadata before display names or keywords', () => {
    expect(
      getAccountingTreatment(
        transaction({
          subCategory: 'A label that can safely change',
          subCategoryRef: {
            accountingType: SubCategoryAccountingType.OWNER_CONTRIBUTION,
          },
        }),
      ),
    ).toBe(AccountingTreatment.OWNER_CONTRIBUTION);
  });

  it('treats a refund/reversal separately instead of dropping it as a transfer', () => {
    expect(
      getAccountingTreatment(
        transaction({ subCategory: 'Refund and Reversal' }),
      ),
    ).toBe(AccountingTreatment.REFUND_REVERSAL);
  });

  it('recognises savings movements even when legacy data says transfer', () => {
    expect(
      getAccountingTreatment(
        transaction({
          direction: TransactionDirection.DEBIT,
          description: 'Transfer to PiggyVest business savings',
        }),
      ),
    ).toBe(AccountingTreatment.ASSET_MOVEMENT);
  });

  it('routes owner funding and drawings to equity treatments', () => {
    expect(
      getAccountingTreatment(
        transaction({
          category: TransactionCategory.EQUITY,
          subCategory: 'Capital contributed',
        }),
      ),
    ).toBe(AccountingTreatment.OWNER_CONTRIBUTION);

    expect(
      getAccountingTreatment(
        transaction({
          category: TransactionCategory.EQUITY,
          direction: TransactionDirection.DEBIT,
          subCategory: 'Personal Use',
        }),
      ),
    ).toBe(AccountingTreatment.OWNER_DRAWING);
  });

  it('keeps uncategorised transactions visible as unclassified', () => {
    expect(
      getAccountingTreatment(
        transaction({ isCategorised: false, category: null }),
      ),
    ).toBe(AccountingTreatment.UNCLASSIFIED);
  });

  it('includes only confirmed operating costs in burn', () => {
    expect(isOperatingExpense(AccountingTreatment.OPERATING_EXPENSE)).toBe(
      true,
    );
    expect(isOperatingExpense(AccountingTreatment.ASSET_MOVEMENT)).toBe(false);
    expect(isOperatingExpense(AccountingTreatment.OWNER_DRAWING)).toBe(false);
    expect(isOperatingExpense(AccountingTreatment.INTERNAL_TRANSFER)).toBe(
      false,
    );
  });
});
