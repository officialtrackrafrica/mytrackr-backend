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

export enum MatchType {
  CONTAINS = 'CONTAINS',
  STARTS_WITH = 'STARTS_WITH',
  EXACT = 'EXACT',
  REGEX = 'REGEX',
}

@Entity('categorization_rules')
export class CategorizationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MatchType })
  matchType: MatchType;

  @Column({ length: 255 })
  matchValue: string;

  @Column({ length: 100 })
  category: string;

  @Column({ length: 100 })
  subCategory: string;

  @Column({ type: 'int', default: 100 })
  priority: number;

  @Column({ default: true })
  isActive: boolean;

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
