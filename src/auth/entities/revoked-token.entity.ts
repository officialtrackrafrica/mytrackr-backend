import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('revoked_tokens')
export class RevokedToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  jti: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  sessionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date;
}
