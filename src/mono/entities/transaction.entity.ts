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

  @Column({ default: 'mono' })
  categorySource: string; // 'mono' | 'manual'

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'bigint' })
  balance: number;

  @Column({ type: 'timestamptz' })
  date: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
