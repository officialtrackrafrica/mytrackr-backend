import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Session } from './session.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ unique: true, nullable: true })
  googleId: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  verificationCode: string;

  @Column({ type: 'timestamp', nullable: true })
  verificationCodeExpiresAt: Date;

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  securitySettings: {
    mfaEnabled: boolean;
    mfaMethod?: 'totp' | 'sms' | 'email';
    mfaSecret?: string;
    lastPasswordChange?: Date;
    failedLoginAttempts?: number;
    lockoutUntil?: Date;
  };

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
