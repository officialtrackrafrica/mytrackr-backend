import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { Transaction } from './transaction.entity';

export enum AccountType {
  CURRENT = 'CURRENT',
  SAVINGS = 'SAVINGS',
  DOMICILIARY = 'DOMICILIARY',
}

export enum SyncStatus {
  CONNECTED = 'CONNECTED',
  SYNC_ERROR = 'SYNC_ERROR',
  DISCONNECTED = 'DISCONNECTED',
}

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  providerAccountId: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ type: 'enum', enum: AccountType, nullable: true })
  accountType: AccountType;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.CONNECTED })
  syncStatus: SyncStatus;

  @ManyToOne(() => Business, (business) => business.id, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ nullable: true })
  businessId: string | null;

  @Column({ nullable: true })
  userId: string | null;

  @Column({ default: false })
  isPrimary: boolean;

  @OneToMany(() => Transaction, (tx) => tx.bankAccount)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
