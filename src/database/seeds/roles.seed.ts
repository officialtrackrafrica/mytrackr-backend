import { Injectable, Logger } from '@nestjs/common';
import { RolesService } from '../../auth/services/roles.service';
import { Action } from '../../casl/action.enum';

@Injectable()
export class RolesSeed {
  private readonly logger = new Logger(RolesSeed.name);

  constructor(private readonly rolesService: RolesService) {}

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
        permissions: [{ action: Action.Manage, subject: 'all' }], // Refine as needed
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
        ],
      },
    ];

    for (const roleData of roles) {
      try {
        await this.rolesService.create(roleData);
        this.logger.log(`Role ${roleData.name} created.`);
      } catch (e: any) {
        if (e.message.includes('already exists') || e.code === '23505') {
          this.logger.debug(`Role ${roleData.name} already exists.`);
        } else {
          this.logger.error(
            `Error creating role ${roleData.name}: ${e.message}`,
          );
        }
      }
    }
  }
}
