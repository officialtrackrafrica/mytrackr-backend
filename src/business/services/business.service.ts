import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import { UpdateBusinessDto } from '../dto';

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  async getBusinessForUser(userId: string): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { userId },
    });
    if (!business) {
      throw new NotFoundException('Business not found for this user');
    }
    return business;
  }

  async getBusinessIdForUser(userId: string): Promise<string> {
    const business = await this.getBusinessForUser(userId);
    return business.id;
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
}
