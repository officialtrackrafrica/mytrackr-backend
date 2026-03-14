import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhook_logs')
@Index('IDX_webhook_log_status', ['status'])
@Index('IDX_webhook_log_source', ['source'])
@Index('IDX_webhook_log_created', ['createdAt'])
export class WebhookLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  source: string;

  @Column()
  event: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ default: 'received' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
