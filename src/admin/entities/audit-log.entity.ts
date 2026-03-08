import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index('IDX_audit_log_user', ['userId'])
@Index('IDX_audit_log_action', ['action'])
@Index('IDX_audit_log_created', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  @Column()
  action: string; // e.g. 'USER_DEACTIVATED', 'SETTING_UPDATED', 'TRANSACTION_FLAGGED'

  @Column()
  resource: string; // e.g. 'User', 'Transaction', 'Setting'

  @Column({ nullable: true })
  resourceId: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}
