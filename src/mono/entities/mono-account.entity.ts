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
import { User } from '../../auth/entities/user.entity';
import { Business } from '../../business/entities/business.entity';
import { Transaction } from './transaction.entity';

@Entity('mono_accounts')
export class MonoAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  monoAccountId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  balance: number;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  bvn: string;

  @Column({ nullable: true })
  institutionName: string;

  @Column({ nullable: true })
  institutionBankCode: string;

  @Column({ nullable: true })
  dataStatus: string;

  @Column({ type: 'timestamptz', nullable: true })
  earliestSyncedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastCategorisedAt: Date;

  @ManyToOne(() => User, (user) => user.monoAccounts, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Business, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid', nullable: true })
  businessId: string | null;

  @OneToMany(() => Transaction, (tx) => tx.monoAccount)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
