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

export enum TransactionDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export const TransactionCategory = {
  INCOME: 'INCOME',
  COGS: 'COGS',
  EXPENSE: 'EXPENSE',
  INTERNAL_TRANSFER: 'INTERNAL_TRANSFER',
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
  externalId: string;

  @Column({ type: 'date' })
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
