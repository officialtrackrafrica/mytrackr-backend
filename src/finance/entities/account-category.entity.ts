import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { AccountSubCategory } from './account-subcategory.entity';

export enum AccountCategoryType {
  INCOME = 'INCOME',
  COGS = 'COGS',
  EXPENSE = 'EXPENSE',
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  TRANSFER = 'TRANSFER',
}

@Entity('account_categories')
export class AccountCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  @Index('IDX_account_category_name')
  name: string;

  @Column({
    type: 'enum',
    enum: AccountCategoryType,
    default: AccountCategoryType.EXPENSE,
  })
  @Index('IDX_account_category_type')
  type: AccountCategoryType;

  @Column({ default: false })
  isSystem: boolean;

  @Column({ nullable: true })
  @Index('IDX_account_category_business_id')
  businessId: string;

  @OneToMany(() => AccountSubCategory, (sub) => sub.category)
  subCategories: AccountSubCategory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
