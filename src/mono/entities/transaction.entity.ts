import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  Unique,
} from 'typeorm';
import { MonoAccount } from './mono-account.entity';
import { CategorySource } from '../../finance/entities/transaction.entity';

@Entity('mono_transactions')
@Unique('UQ_mono_tx_per_account', ['monoTransactionId', 'monoAccount'])
@Index('IDX_mono_tx_date', ['monoAccount', 'date'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  monoTransactionId: string;

  @ManyToOne(() => MonoAccount, (acc) => acc.transactions, {
    onDelete: 'CASCADE',
  })
  monoAccount: MonoAccount;

  @Column()
  narration: string;

  @Column({ type: 'bigint' })
  amount: number;

  @Column()
  type: string;

  @Column({ nullable: true, type: 'varchar' })
  category: string | null;

  @Column({ nullable: true, type: 'varchar' })
  subCategory: string | null;

  @Column({ nullable: true, type: 'uuid' })
  @Index('IDX_mono_tx_category_id')
  categoryId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  @Index('IDX_mono_tx_subcategory_id')
  subCategoryId: string | null;

  @Column({ nullable: true, type: 'varchar' })
  manualCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  manualSubCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  aiCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  ruleCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  ruleSubCategory: string | null;

  @Column({ nullable: true, type: 'varchar' })
  heuristicCategory: string | null;

  @Column({ type: 'enum', enum: CategorySource, default: CategorySource.MONO })
  categorySource: CategorySource;
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'bigint' })
  balance: number;

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ default: false })
  isCategorised: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
