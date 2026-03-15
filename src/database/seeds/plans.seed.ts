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
        name: 'Free',
        slug: 'free',
        price: 0,
        currency: 'NGN',
        interval: 'month',
        features: ['Basic Tracking', 'Limited Reports'],
        isActive: true,
      },
      {
        name: 'Premium',
        slug: 'premium',
        price: 3095.0, // N3095 as requested
        currency: 'NGN',
        interval: 'month',
        features: [
          'Unlimited Tracking',
          'Advanced Reports',
          'Export Data',
          'Priority Support',
        ],
        isActive: true,
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
