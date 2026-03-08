import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // e.g., 'Free', 'Premium'

  @Column({ unique: true })
  slug: string; // e.g., 'free', 'premium'

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ default: 'month' })
  interval: string; // 'month', 'year', 'lifetime'

  @Column({ type: 'jsonb', default: [] })
  features: string[]; // List of features this plan unlocks

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
