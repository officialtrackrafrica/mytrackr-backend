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
  PRODUCT = 'PRODUCT',
  SERVICE = 'SERVICE',
}

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: BusinessType, default: BusinessType.SERVICE })
  businessType: BusinessType;

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
