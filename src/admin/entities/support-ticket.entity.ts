import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('support_tickets')
@Index('IDX_support_ticket_user', ['userId'])
@Index('IDX_support_ticket_status', ['status'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ default: 'open' })
  status: string; // 'open' | 'in_progress' | 'resolved' | 'closed'

  @Column({ default: 'medium' })
  priority: string; // 'low' | 'medium' | 'high' | 'critical'

  @Column({ nullable: true })
  assignedTo: string;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
