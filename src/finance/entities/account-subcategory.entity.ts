import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AccountCategory } from './account-category.entity';

export enum SubCategoryAccountingType {
  REVENUE = 'REVENUE',
  COGS = 'COGS',
  OPERATING_EXPENSE = 'OPERATING_EXPENSE',
  OTHER_EXPENSE = 'OTHER_EXPENSE',
  REFUND_REVERSAL = 'REFUND_REVERSAL',
  OWNER_CONTRIBUTION = 'OWNER_CONTRIBUTION',
  OWNER_DRAWING = 'OWNER_DRAWING',
  LOAN_RECEIVED = 'LOAN_RECEIVED',
  LOAN_REPAYMENT = 'LOAN_REPAYMENT',
  ASSET_MOVEMENT = 'ASSET_MOVEMENT',
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
  UNCLASSIFIED = 'UNCLASSIFIED',
}

@Entity('account_subcategories')
export class AccountSubCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  @Index('IDX_account_subcategory_name')
  name: string;

  @Column({ nullable: true })
  @Index('IDX_account_subcategory_parent_id')
  categoryId: string;

  @ManyToOne(() => AccountCategory, (cat) => cat.subCategories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'categoryId' })
  category: AccountCategory;

  @Column({ default: false })
  isSystem: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true, select: false })
  accountingType: SubCategoryAccountingType | null;

  @Column({ nullable: true })
  @Index('IDX_account_subcategory_business_id')
  businessId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
