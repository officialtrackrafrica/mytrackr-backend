import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { BankAccount } from './bank-account.entity';
import { CategorizationRule } from './categorization-rule.entity';
import { AccountCategory } from './account-category.entity';
import { AccountSubCategory } from './account-subcategory.entity';

export enum TransactionDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum CategorySource {
  MONO = 'MONO',
  AI = 'AI',
  RULE = 'RULE',
  HEURISTIC = 'HEURISTIC',
  MANUAL = 'MANUAL',
}

export const TransactionCategory = {
  INCOME: 'INCOME',
  COGS: 'COGS',
  EXPENSE: 'EXPENSE',
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  TRANSFER: 'TRANSFER',
} as const;

export type TransactionCategory =
  (typeof TransactionCategory)[keyof typeof TransactionCategory];

@Entity('transactions')
@Index(
  'IDX_tx_dedup',
  ['bankAccount', 'externalId', 'date', 'amount', 'direction'],
  { unique: true },
)
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  @Index('IDX_tx_external_id')
  externalId: string;

  @Column({ nullable: true })
  @Index('IDX_tx_name')
  name: string;

  @Column({ type: 'date' })
  @Index('IDX_tx_date')
  date: Date;

  @Column({ type: 'date', nullable: true })
  valueDate: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: TransactionDirection })
  direction: TransactionDirection;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  @Column({ nullable: true })
  subCategory: string;

  @Column({ nullable: true })
  monoCategory: string;

  @Column({ nullable: true })
  aiCategory: string;

  @Column({ nullable: true })
  manualCategory: string;

  @Column({ nullable: true })
  manualSubCategory: string;

  @Column({ nullable: true, type: 'varchar' })
  ruleCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  ruleSubCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  heuristicCategory: string | null;

  @Column({ type: 'enum', enum: CategorySource, default: CategorySource.MONO })
  categorySource: CategorySource;

  @ManyToOne(() => AccountCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  categoryRef: AccountCategory;

  @Column({ nullable: true })
  @Index('IDX_tx_category_id')
  categoryId: string;

  @ManyToOne(() => AccountSubCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subCategoryId' })
  subCategoryRef: AccountSubCategory;

  @Column({ nullable: true })
  @Index('IDX_tx_subcategory_id')
  subCategoryId: string;

  @Column({ default: false })
  isCategorised: boolean;

  @ManyToOne(() => CategorizationRule, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ruleId' })
  rule: CategorizationRule;

  @Column({ nullable: true })
  ruleId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ nullable: true })
  businessId: string;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => BankAccount, (acc) => acc.transactions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Column({ nullable: true })
  bankAccountId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
