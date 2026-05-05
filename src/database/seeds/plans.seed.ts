import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../payments/entities/plan.entity';

@Injectable()
export class PlansSeed {
  private readonly logger = new Logger(PlansSeed.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async run() {
    const plans = [
      {
        name: 'Basic',
        slug: 'basic',
        price: 0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['OCR statement upload'],
        isActive: true,
      },
      {
        name: 'Pro',
        slug: 'pro',
        price: 3095.0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['OCR statement upload', 'Link 1 bank account'],
        isActive: true,
      },
      {
        name: 'Pro Yearly',
        slug: 'pro-yearly',
        price: 30950.0,
        currency: 'NGN',
        interval: 'annually',
        features: ['OCR statement upload', 'Link 1 bank account'],
        isActive: true,
      },
      {
        name: 'Pro+',
        slug: 'pro-plus',
        price: 5095.0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['OCR statement upload', 'Link 2 bank accounts'],
        isActive: true,
      },
      {
        name: 'Pro+ Yearly',
        slug: 'pro-plus-yearly',
        price: 50950.0,
        currency: 'NGN',
        interval: 'annually',
        features: ['OCR statement upload', 'Link 2 bank accounts'],
        isActive: true,
      },
      {
        name: 'Free',
        slug: 'free',
        price: 0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['Legacy free plan'],
        isActive: false,
      },
      {
        name: 'Premium',
        slug: 'premium',
        price: 3095.0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['Legacy premium plan'],
        isActive: false,
      },
      {
        name: 'Premium Yearly',
        slug: 'premium-yearly',
        price: 30950.0,
        currency: 'NGN',
        interval: 'annually',
        features: ['Legacy premium yearly plan'],
        isActive: false,
      },
    ];

    for (const planData of plans) {
      const existing = await this.planRepository.findOne({
        where: { slug: planData.slug },
      });

      if (existing) {
        this.logger.debug(`Plan ${planData.slug} already exists, updating...`);
        Object.assign(existing, planData);
        await this.planRepository.save(existing);
      } else {
        this.logger.log(`Creating Plan ${planData.slug}...`);
        const plan = this.planRepository.create(planData);
        await this.planRepository.save(plan);
      }
    }
  }
}
