import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('integration_plans')
export class IntegrationPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ default: 'monthly' })
  interval: string;

  @Column({ default: 1000 })
  monthlyRequestLimit: number;

  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  gatewayPlanId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
