import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../auth/entities/role.entity';
import { Action } from '../../casl/action.enum';

@Injectable()
export class RolesSeed {
  private readonly logger = new Logger(RolesSeed.name);

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  async run() {
    const roles = [
      {
        name: 'Super Admin',
        description: 'Super Administrator with full access',
        permissions: [{ action: Action.Manage, subject: 'all' }],
      },
      {
        name: 'Admin',
        description: 'Administrator with management access',
        permissions: [{ action: Action.Manage, subject: 'all' }],
      },
      {
        name: 'Staff',
        description: 'Staff member with operational access',
        permissions: [
          { action: Action.Read, subject: 'all' },
          { action: Action.Update, subject: 'User' },
        ],
      },
      {
        name: 'User',
        description: 'Standard User',
        permissions: [
          { action: Action.Read, subject: 'User' },
          { action: Action.Update, subject: 'User' },
          { action: Action.Read, subject: 'Session' },
          { action: Action.Delete, subject: 'Session' },
          { action: Action.Read, subject: 'Mfa' },
          { action: Action.Create, subject: 'Mfa' },
          { action: Action.Update, subject: 'Mfa' },
          { action: Action.Delete, subject: 'Mfa' },
        ],
      },
    ];

    for (const roleData of roles) {
      try {
        const existing = await this.rolesRepository.findOne({
          where: { name: roleData.name },
        });

        if (existing) {
          existing.description = roleData.description;
          existing.permissions = roleData.permissions;
          await this.rolesRepository.save(existing);
          this.logger.log(
            `Role ${roleData.name} updated with latest permissions.`,
          );
        } else {
          const role = this.rolesRepository.create(roleData);
          await this.rolesRepository.save(role);
          this.logger.log(`Role ${roleData.name} created.`);
        }
      } catch (e: any) {
        this.logger.error(`Error seeding role ${roleData.name}: ${e.message}`);
      }
    }
  }
}
