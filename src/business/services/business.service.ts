import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessType } from '../entities/business.entity';
import { User } from '../../auth/entities/user.entity';

export class CreateBusinessDto {
  name: string;
  businessType: BusinessType;
  currency?: string;
}

export class UpdateBusinessDto {
  name?: string;
  businessType?: BusinessType;
  currency?: string;
}

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  async create(user: User, dto: CreateBusinessDto): Promise<Business> {
    const business = this.businessRepository.create({
      ...dto,
      owner: user,
      userId: user.id,
    });
    return this.businessRepository.save(business);
  }

  async findAllForUser(userId: string): Promise<Business[]> {
    return this.businessRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { id, userId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateBusinessDto,
  ): Promise<Business> {
    const business = await this.findOne(id, userId);
    Object.assign(business, dto);
    return this.businessRepository.save(business);
  }

  async remove(id: string, userId: string): Promise<void> {
    const business = await this.findOne(id, userId);
    await this.businessRepository.remove(business);
  }
}
