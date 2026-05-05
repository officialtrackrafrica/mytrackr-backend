import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';
import { User } from '../../auth/entities/user.entity';
import { Integration } from './integration.entity';

export enum IntegrationEventType {
  ORDER_PAID = 'order.paid',
  ORDER_REFUNDED = 'order.refunded',
  ORDER_CANCELLED = 'order.cancelled',
  PAYMENT_FAILED = 'payment.failed',
}

@Entity('integration_events')
@Index('IDX_integration_event_dedup', ['integrationId', 'externalId'], {
  unique: true,
})
@Index('IDX_integration_event_business_date', ['businessId', 'occurredAt'])
export class IntegrationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Integration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'integrationId' })
  integration: Integration;

  @Column()
  integrationId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  businessId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: IntegrationEventType })
  event: IntegrationEventType;

  @Column()
  externalId: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  paymentFee: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ nullable: true })
  paymentProvider: string;

  @Column({ nullable: true })
  customerEmail: string;

  @Column({ nullable: true })
  customerName: string;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @OneToMany(() => IntegrationEventItem, (item) => item.event, {
    cascade: true,
  })
  items: IntegrationEventItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('integration_event_items')
@Index('IDX_integration_event_item_product', ['productId'])
@Index('IDX_integration_event_item_category', ['category'])
export class IntegrationEventItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => IntegrationEvent, (event) => event.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event: IntegrationEvent;

  @Column()
  eventId: string;

  @Column({ nullable: true })
  productId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total: number;
}
