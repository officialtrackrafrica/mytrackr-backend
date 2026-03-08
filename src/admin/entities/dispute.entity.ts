import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('disputes')
@Index('IDX_dispute_user', ['userId'])
@Index('IDX_dispute_status', ['status'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  transactionId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ default: 'open' })
  status: string; // 'open' | 'investigating' | 'resolved' | 'rejected'

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ nullable: true })
  resolvedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
