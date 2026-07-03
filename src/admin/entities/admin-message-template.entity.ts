import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AdminMessageTemplateChannel = 'email' | 'push';

@Entity('admin_message_templates')
@Index('IDX_admin_message_template_channel', ['channel'])
export class AdminMessageTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'email' })
  channel: AdminMessageTemplateChannel;

  @Column()
  name: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
