import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationPlan } from '../../integrations/entities/integration-plan.entity';

@Injectable()
export class IntegrationPlansSeed {
  private readonly logger = new Logger(IntegrationPlansSeed.name);

  constructor(
    @InjectRepository(IntegrationPlan)
    private readonly integrationPlanRepository: Repository<IntegrationPlan>,
  ) {}

  async run() {
    const plans = [
      {
        name: 'API Starter',
        slug: 'starter',
        price: 10000,
        currency: 'NGN',
        interval: 'monthly',
        monthlyRequestLimit: 1000,
        features: ['1 website integration', 'Public config endpoint'],
        isActive: true,
      },
      {
        name: 'API Growth',
        slug: 'growth',
        price: 30000,
        currency: 'NGN',
        interval: 'monthly',
        monthlyRequestLimit: 10000,
        features: ['Higher API limits', 'React and WordPress support'],
        isActive: true,
      },
      {
        name: 'API Scale',
        slug: 'scale',
        price: 75000,
        currency: 'NGN',
        interval: 'monthly',
        monthlyRequestLimit: 50000,
        features: ['High-volume API access', 'Priority integration support'],
        isActive: true,
      },
    ];

    for (const planData of plans) {
      const existing = await this.integrationPlanRepository.findOne({
        where: { slug: planData.slug },
      });

      if (existing) {
        this.logger.debug(`Integration plan ${planData.slug} already exists`);
        Object.assign(existing, planData);
        await this.integrationPlanRepository.save(existing);
      } else {
        this.logger.log(`Creating integration plan ${planData.slug}`);
        const plan = this.integrationPlanRepository.create(planData);
        await this.integrationPlanRepository.save(plan);
      }
    }
  }
}
