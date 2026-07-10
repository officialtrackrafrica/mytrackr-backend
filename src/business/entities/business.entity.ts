import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum BusinessType {
  SOLE_PROPRIETORSHIP = 'SOLE_PROPRIETORSHIP',
  PRIVATE_LIMITED_COMPANY = 'PRIVATE_LIMITED_COMPANY',
  PUBLIC_LIMITED_COMPANY = 'PUBLIC_LIMITED_COMPANY',
  PARTNERSHIP_LIMITED_LLP = 'PARTNERSHIP_LIMITED_LLP',
  INCORPORATED_TRUSTEES = 'INCORPORATED_TRUSTEES',
}

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: BusinessType,
    nullable: true,
  })
  businessType: BusinessType | null;

  @Column({ default: 'NGN' })
  currency: string;

  @OneToOne(() => User, (user) => user.business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  owner: User;

  @Column({ unique: true })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
