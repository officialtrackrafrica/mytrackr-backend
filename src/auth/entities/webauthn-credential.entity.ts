import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('webauthn_credentials')
export class WebAuthnCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  credentialID: string;

  @Column('text')
  credentialPublicKey: string;

  @Column({ type: 'bigint', default: 0 })
  counter: number;

  @Column({ type: 'simple-array', nullable: true })
  transports: string[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;
}
