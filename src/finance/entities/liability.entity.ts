import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';

export enum LiabilityType {
  BUSINESS_LOAN = 'Business Loan',
  COOPERATIVE_LOAN = 'Cooperative Loan',
  FAMILY_LOAN = 'Friends & Family Loan',
  SUPPLIER_DEBT = 'Money owed to Supplier',
  OTHER = 'Other Liabilities',
}

export enum LiabilityStatus {
  ACTIVE = 'ACTIVE',
  SETTLED = 'SETTLED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('liabilities')
export class Liability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: LiabilityType })
  liabilityType: LiabilityType;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amountOwed: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  originalAmount: number | null;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: LiabilityStatus,
    default: LiabilityStatus.ACTIVE,
  })
  status: LiabilityStatus;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  businessId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
