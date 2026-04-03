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

export enum AssetCategory {
  CASH_BANK = 'Cash in Bank Account',
  CASH_HAND = 'Cash in Hand',
  INVENTORY = 'Goods/Stock/Inventory',
  RECEIVABLES = 'Money Owed by Customers (Receivables)',
  LAND_BUILDINGS = 'Land & Buildings',
  EQUIPMENT = 'Equipment & Machinery',
  FURNITURE = 'Furniture',
  OTHER = 'Other Assets',
}

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: AssetCategory })
  category: AssetCategory;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  purchaseValue: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  currentValue: number;

  @Column({ type: 'date', nullable: true })
  purchaseDate: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ default: false })
  isArchived: boolean;

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
