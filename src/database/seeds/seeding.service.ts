import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RolesSeed } from './roles.seed';
import { AdminSeed } from './admin.seed';

@Injectable()
export class SeedingService implements OnModuleInit {
  private readonly logger = new Logger(SeedingService.name);

  constructor(
    private readonly rolesSeed: RolesSeed,
    private readonly adminSeed: AdminSeed,
  ) {}

  async onModuleInit() {
    this.logger.log('Checking for database seeds...');
    try {
      await this.rolesSeed.run();
      await this.adminSeed.run();
      this.logger.log('Database seeding completed successfully.');
    } catch (error) {
      this.logger.error('Failed to seed database', error.stack);
    }
  }
}
