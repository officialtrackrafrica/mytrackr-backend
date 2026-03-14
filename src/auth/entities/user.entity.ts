import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Session } from './session.entity';
import { Role } from './role.entity';
import { Business } from '../../business/entities/business.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';

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
  businessName: string;

  @Column({ nullable: true })
  profilePicture: string;

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

  @Column({ nullable: true })
  resetPasswordToken: string;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires: Date;

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  securitySettings: {
    mfaEnabled: boolean;
    mfaMethod?: 'totp' | 'sms' | 'email';
    mfaSecret?: string;
    mfaBackupCodes?: string[];
    lastPasswordChange?: Date;
    failedLoginAttempts?: number;
    lockoutUntil?: Date;
  };

  @Column({ type: 'jsonb', nullable: true })
  onboardingState: {
    profileComplete: boolean;
    bankConnected: boolean;
    bankSkipped: boolean;
    setupComplete: boolean;
  };

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @ManyToMany(() => Role)
  @JoinTable()
  roles: Role[];

  @OneToMany(() => Business, (business) => business.owner)
  businesses: Business[];

  @OneToMany(() => MonoAccount, (monoAccount) => monoAccount.user)
  monoAccounts: MonoAccount[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
