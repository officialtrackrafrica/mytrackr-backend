import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';

@Entity('integration_paystack_connections')
export class PaystackConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ unique: true })
  businessId: string;

  @Column()
  userId: string;

  @Column({ type: 'jsonb' })
  encryptedSecretKey: {
    encrypted: string;
    iv: string;
    tag: string;
    salt: string;
  };

  @Column()
  keyLast4: string;

  @Column({ nullable: true })
  businessName: string;

  @Column({ nullable: true })
  businessEmail: string;

  @Column({ nullable: true })
  country: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSuccessfulSyncAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
