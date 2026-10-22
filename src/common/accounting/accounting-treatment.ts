import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';

export enum AccountingTreatment {
  REVENUE = 'REVENUE',
  COGS = 'COGS',
  OPERATING_EXPENSE = 'OPERATING_EXPENSE',
  OTHER_EXPENSE = 'OTHER_EXPENSE',
  REFUND_REVERSAL = 'REFUND_REVERSAL',
  OWNER_CONTRIBUTION = 'OWNER_CONTRIBUTION',
  OWNER_DRAWING = 'OWNER_DRAWING',
  LOAN_RECEIVED = 'LOAN_RECEIVED',
  LOAN_REPAYMENT = 'LOAN_REPAYMENT',
  ASSET_MOVEMENT = 'ASSET_MOVEMENT',
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
  UNCLASSIFIED = 'UNCLASSIFIED',
}

const OTHER_EXPENSE_TERMS = [
  'tax payment',
  'tax',
  'interest on loan',
  'interest',
  'loan interest',
];

const normalize = (value?: string | null) =>
  (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function getAccountingTreatment(
  tx: Pick<
    Transaction,
    | 'isCategorised'
    | 'category'
    | 'subCategory'
    | 'direction'
    | 'description'
    | 'name'
    | 'subCategoryRef'
  >,
): AccountingTreatment {
  if (!tx.isCategorised || !tx.category) {
    return AccountingTreatment.UNCLASSIFIED;
  }

  const subCategory = normalize(tx.subCategory);
  const transactionText = normalize(`${tx.name || ''} ${tx.description || ''}`);
  const storedAccountingType = tx.subCategoryRef?.accountingType;

  const storedTreatment = Object.values(AccountingTreatment).find(
    (treatment) => treatment === String(storedAccountingType),
  );

  if (storedTreatment) {
    return storedTreatment;
  }

  if (
    tx.category === TransactionCategory.TRANSFER &&
    (subCategory.includes('refund') || subCategory.includes('reversal'))
  ) {
    return AccountingTreatment.REFUND_REVERSAL;
  }

  if (
    tx.category === TransactionCategory.ASSET ||
    (tx.category === TransactionCategory.TRANSFER &&
      /\b(savings?|piggyvest|investment|loan repayment)\b/.test(
        transactionText,
      ))
  ) {
    return AccountingTreatment.ASSET_MOVEMENT;
  }

  if (tx.category === TransactionCategory.EQUITY) {
    return tx.direction === TransactionDirection.CREDIT
      ? AccountingTreatment.OWNER_CONTRIBUTION
      : AccountingTreatment.OWNER_DRAWING;
  }

  if (tx.category === TransactionCategory.LIABILITY) {
    return tx.direction === TransactionDirection.CREDIT
      ? AccountingTreatment.LOAN_RECEIVED
      : AccountingTreatment.LOAN_REPAYMENT;
  }

  if (tx.category === TransactionCategory.TRANSFER) {
    return AccountingTreatment.INTERNAL_TRANSFER;
  }

  if (
    tx.category === TransactionCategory.INCOME &&
    tx.direction === TransactionDirection.CREDIT
  ) {
    return AccountingTreatment.REVENUE;
  }

  if (
    tx.category === TransactionCategory.COGS &&
    tx.direction === TransactionDirection.DEBIT
  ) {
    return AccountingTreatment.COGS;
  }

  if (
    tx.category === TransactionCategory.EXPENSE &&
    tx.direction === TransactionDirection.DEBIT
  ) {
    return OTHER_EXPENSE_TERMS.some((term) => subCategory.includes(term))
      ? AccountingTreatment.OTHER_EXPENSE
      : AccountingTreatment.OPERATING_EXPENSE;
  }

  return AccountingTreatment.UNCLASSIFIED;
}

export function isOperatingExpense(treatment: AccountingTreatment): boolean {
  return (
    treatment === AccountingTreatment.COGS ||
    treatment === AccountingTreatment.OPERATING_EXPENSE ||
    treatment === AccountingTreatment.OTHER_EXPENSE
  );
}
