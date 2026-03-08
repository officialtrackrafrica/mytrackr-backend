import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Plan } from './plan.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Plan)
  plan: Plan;

  @Column({ default: 'active' })
  status: string; // 'active', 'past_due', 'canceled', 'trialing'

  @Column({ type: 'varchar', nullable: true })
  gatewaySubscriptionId: string; // ID from Paystack/Stripe etc

  @Column({ type: 'varchar', nullable: true })
  gatewayCustomerCode: string; // Customer code from gateway

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart: Date;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  canceledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
