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
        name: 'Starter',
        slug: 'starter',
        price: 500,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'Upload your bank statement manually',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'Tax estimator',
          'Automatic categorization rules',
        ],
        isActive: true,
      },
      {
        name: 'Web',
        slug: 'web',
        price: 1200,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'Link via website',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'Tax estimator',
          'Automatic categorization rules',
          'Upload your bank statement manually',
        ],
        isActive: true,
      },
      {
        name: 'Solo',
        slug: 'solo',
        price: 2900,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'Live sync - 1 bank account',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'Tax estimator',
          'Automatic categorization rules',
          'Website linking and manual bank statement upload included',
        ],
        isActive: true,
      },
      {
        name: 'Duo',
        slug: 'duo',
        price: 3400,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'Live sync - 2 bank accounts',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'Tax estimator',
          'Automatic categorization rules',
          'Website linking and manual bank statement upload included',
        ],
        isActive: true,
      },
      {
        name: 'Unlimited',
        slug: 'unlimited',
        price: 5500,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'Live sync - unlimited bank accounts',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'Tax estimator',
          'Automatic categorization rules',
          'Website linking and manual bank statement upload included',
        ],
        isActive: true,
      },
      // Legacy aliases kept for backward compatibility with existing records.
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
        price: 2900,
        currency: 'NGN',
        interval: 'monthly',
        features: ['Legacy premium plan'],
        isActive: false,
      },
      {
        name: 'Premium Yearly',
        slug: 'premium-yearly',
        price: 29000.0,
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
