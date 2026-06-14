import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../../admin/entities/system-setting.entity';
import { Plan } from '../../payments/entities/plan.entity';
import { Subscription } from '../../payments/entities/subscription.entity';

const SUBSCRIPTION_PLAN_MIGRATION_KEY =
  'migrations.subscriptions.pro-to-solo.pro-plus-to-duo';
const LEGACY_PLAN_SLUGS = [
  'basic',
  'pro',
  'pro-yearly',
  'pro-plus',
  'pro-plus-yearly',
  'free',
  'premium',
  'premium-yearly',
] as const;

@Injectable()
export class SubscriptionPlanMigrationSeed {
  private readonly logger = new Logger(SubscriptionPlanMigrationSeed.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
  ) {}

  async run() {
    const existingMigration = await this.settingsRepository.findOne({
      where: { key: SUBSCRIPTION_PLAN_MIGRATION_KEY },
    });

    if (existingMigration) {
      this.logger.debug('Subscription plan migration already completed.');
      return;
    }

    const plans = await this.planRepository.find({
      where: [
        { slug: 'basic' },
        { slug: 'starter' },
        { slug: 'pro' },
        { slug: 'pro-yearly' },
        { slug: 'pro-plus' },
        { slug: 'pro-plus-yearly' },
        { slug: 'solo' },
        { slug: 'duo' },
        { slug: 'free' },
        { slug: 'premium' },
        { slug: 'premium-yearly' },
      ],
    });

    const planBySlug = new Map(plans.map((plan) => [plan.slug, plan]));
    const proPlan = planBySlug.get('pro');
    const proPlusPlan = planBySlug.get('pro-plus');
    const soloPlan = planBySlug.get('solo');
    const duoPlan = planBySlug.get('duo');
    const starterPlan = planBySlug.get('starter');

    if (!starterPlan || !soloPlan || !duoPlan) {
      this.logger.warn(
        'Skipping subscription plan migration because target plans starter/solo/duo do not exist yet.',
      );
      return;
    }

    const migrationResult = await this.subscriptionRepository.manager.transaction(
      async (manager) => {
        let movedFromPro = 0;
        let movedFromProPlus = 0;
        let deactivatedLegacyPlans = 0;

        if (proPlan) {
          const result = await manager
            .createQueryBuilder()
            .update(Subscription)
            .set({ plan: soloPlan })
            .where('"planId" = :planId', { planId: proPlan.id })
            .execute();
          movedFromPro = result.affected || 0;
        }

        if (proPlusPlan) {
          const result = await manager
            .createQueryBuilder()
            .update(Subscription)
            .set({ plan: duoPlan })
            .where('"planId" = :planId', { planId: proPlusPlan.id })
            .execute();
          movedFromProPlus = result.affected || 0;
        }

        const legacyPlanIds = LEGACY_PLAN_SLUGS.map((slug) => planBySlug.get(slug))
          .filter((plan): plan is Plan => Boolean(plan))
          .filter((plan) => plan.isActive)
          .map((plan) => plan.id);

        if (legacyPlanIds.length > 0) {
          const result = await manager
            .createQueryBuilder()
            .update(Plan)
            .set({ isActive: false })
            .where('id IN (:...planIds)', { planIds: legacyPlanIds })
            .execute();
          deactivatedLegacyPlans = result.affected || 0;
        }

        const setting = manager.create(SystemSetting, {
          key: SUBSCRIPTION_PLAN_MIGRATION_KEY,
          value: {
            movedFromPro,
            movedFromProPlus,
            deactivatedLegacyPlans,
            sourcePlanSlugs: ['pro', 'pro-plus'],
            targetPlanSlugs: ['solo', 'duo'],
            completedAt: new Date().toISOString(),
          },
          category: 'migration',
          description:
            'Reassign existing subscriptions from pro to solo and pro-plus to duo.',
        });

        await manager.save(SystemSetting, setting);

        return { movedFromPro, movedFromProPlus, deactivatedLegacyPlans };
      },
    );

    this.logger.log(
      `Subscription plan migration completed. Reassigned ${migrationResult.movedFromPro} pro subscription(s) to solo, ${migrationResult.movedFromProPlus} pro-plus subscription(s) to duo, and deactivated ${migrationResult.deactivatedLegacyPlans} legacy public plan(s).`,
    );
  }
}
