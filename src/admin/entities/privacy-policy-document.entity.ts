import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PrivacyPolicyStatus = 'draft' | 'published';

@Entity('privacy_policy_documents')
@Index('IDX_privacy_policy_status_effective', ['status', 'effectiveAt'])
export class PrivacyPolicyDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  version: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'draft' })
  status: PrivacyPolicyStatus;

  @Column({ type: 'timestamptz', nullable: true })
  effectiveAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
