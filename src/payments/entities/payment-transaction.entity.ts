import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  user: User;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column()
  gateway: string; // 'paystack', 'stripe', etc

  @Column({ unique: true })
  reference: string;

  @Column({ nullable: true })
  gatewayReference: string; // Native reference from the provider

  @Column({ default: 'pending' })
  status: string; // 'pending', 'success', 'failed', 'abandoned'

  @Column({ nullable: true, type: 'varchar' })
  paymentMethod: string; // e.g., 'card', 'bank_transfer'

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
