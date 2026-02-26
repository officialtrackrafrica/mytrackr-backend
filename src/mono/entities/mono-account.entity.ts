import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('mono_accounts')
export class MonoAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  accountId: string;

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

  @ManyToOne(() => User, (user) => user.monoAccounts, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
