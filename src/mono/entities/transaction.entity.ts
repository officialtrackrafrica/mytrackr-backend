import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
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
  type: string; // 'credit' | 'debit'

  @Column({ nullable: true })
  category: string;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'bigint' })
  balance: number;

  @Column({ type: 'timestamptz' })
  date: Date;

  @CreateDateColumn()
  createdAt: Date;
}
