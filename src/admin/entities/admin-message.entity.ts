import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AdminMessageChannel = 'email' | 'push';
export type AdminMessageStatus = 'sent' | 'draft' | 'trash' | 'failed';

@Entity('admin_messages')
@Index('IDX_admin_message_channel', ['channel'])
@Index('IDX_admin_message_status', ['status'])
export class AdminMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'email' })
  channel: AdminMessageChannel;

  @Column({ default: 'draft' })
  status: AdminMessageStatus;

  @Column({ type: 'varchar', nullable: true })
  recipientGroup: string | null;

  @Column({ type: 'jsonb', default: [] })
  recipients: string[];

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  @Column()
  createdBy: string;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  trashedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
