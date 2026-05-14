import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessType } from '../entities/business.entity';
import { UpdateBusinessDto } from '../dto';

@Injectable()
export class BusinessService {
  private readonly businessTypeLabels: Record<BusinessType, string> = {
    [BusinessType.SOLE_PROPRIETORSHIP]: 'Sole Proprietorship',
    [BusinessType.PRIVATE_LIMITED_COMPANY]: 'Private Limited Company',
    [BusinessType.PUBLIC_LIMITED_COMPANY]: 'Public Limited Company (PLC)',
    [BusinessType.PARTNERSHIP_LIMITED_LLP]: 'Partnership (Limited/LLP)',
    [BusinessType.INCORPORATED_TRUSTEES]: 'Incorporated Trustees',
  };

  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  getBusinessTypes(): Array<{ value: BusinessType; label: string }> {
    return Object.values(BusinessType).map((value) => ({
      value,
      label: this.businessTypeLabels[value],
    }));
  }

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
