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

  @Column({ nullable: true })
  @Index('IDX_account_subcategory_business_id')
  businessId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
