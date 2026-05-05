import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Business } from '../../business/entities/business.entity';
import { IntegrationPlan } from './integration-plan.entity';

export enum IntegrationPlatform {
  REACT = 'react',
  WORDPRESS = 'wordpress',
  CUSTOM = 'custom',
}

export enum IntegrationBillingStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

@Entity('integrations')
@Index('IDX_integration_public_key', ['publicKey'], { unique: true })
@Index('IDX_integration_api_key_prefix', ['apiKeyPrefix'])
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  business: Business;

  @ManyToOne(() => IntegrationPlan, { nullable: true })
  plan: IntegrationPlan | null;

  @Column({ length: 120 })
  name: string;

  @Column({
    type: 'enum',
    enum: IntegrationPlatform,
    default: IntegrationPlatform.CUSTOM,
  })
  platform: IntegrationPlatform;

  @Column({ unique: true })
  publicKey: string;

  @Column()
  apiKeyPrefix: string;

  @Column()
  apiKeyHash: string;

  @Column({ type: 'jsonb', default: [] })
  allowedOrigins: string[];

  @Column({ nullable: true })
  redirectUrl: string;

  @Column({ nullable: true })
  webhookUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: IntegrationBillingStatus,
    default: IntegrationBillingStatus.PENDING,
  })
  billingStatus: IntegrationBillingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
