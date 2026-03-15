import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RolesSeed } from './roles.seed';
import { AdminSeed } from './admin.seed';
import { PlansSeed } from './plans.seed';

@Injectable()
export class SeedingService implements OnModuleInit {
  private readonly logger = new Logger(SeedingService.name);

  constructor(
    private readonly rolesSeed: RolesSeed,
    private readonly adminSeed: AdminSeed,
    private readonly plansSeed: PlansSeed,
  ) {}

  async onModuleInit() {
    this.logger.log('Checking for database seeds...');
    try {
      await this.rolesSeed.run();
      await this.adminSeed.run();
      await this.plansSeed.run();
      this.logger.log('Database seeding completed successfully.');
    } catch (error) {
      this.logger.error('Failed to seed database', error.stack);
    }
  }
}
