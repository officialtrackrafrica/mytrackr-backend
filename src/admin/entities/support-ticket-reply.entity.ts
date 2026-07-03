import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SupportTicketReplySenderType = 'user' | 'admin';

@Entity('support_ticket_replies')
@Index('IDX_support_ticket_reply_ticket', ['ticketId'])
export class SupportTicketReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ticketId: string;

  @Column()
  senderId: string;

  @Column()
  senderType: SupportTicketReplySenderType;

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true })
  attachmentUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
