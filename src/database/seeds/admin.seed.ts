import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User, Role } from '../../auth/entities';
import { EncryptionService } from '../../security/encryption.service';
import { Repository } from 'typeorm';

@Injectable()
export class AdminSeed {
  private readonly logger = new Logger(AdminSeed.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async run() {
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@mytrackr.com';
    const adminPassword =
      process.env.SUPER_ADMIN_PASSWORD || 'SuperSecretAdmin123!';

    let admin = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    if (!admin) {
      this.logger.log('Creating Super Admin user...');
      admin = this.userRepository.create({
        email: adminEmail,
        firstName: 'Super',
        lastName: 'Admin',
        passwordHash: await this.encryptionService.hashPassword(adminPassword),
        isVerified: true,
        isActive: true,
        securitySettings: { mfaEnabled: false },
      });
      admin = await this.userRepository.save(admin);
    } else {
      this.logger.debug('Admin user already exists.');
    }

    const superAdminRole = await this.roleRepository.findOne({
      where: { name: 'Super Admin' },
    });

    if (superAdminRole) {
      admin = await this.userRepository.findOne({
        where: { id: admin.id },
        relations: ['roles'],
      });
      if (admin && !admin.roles.some((r) => r.id === superAdminRole.id)) {
        admin.roles.push(superAdminRole);
        await this.userRepository.save(admin);
        this.logger.log('Super Admin role assigned to user.');
      } else {
        this.logger.debug('User already has Super Admin role.');
      }
    } else {
      this.logger.error(
        'Super Admin role not found. Please ensure RolesSeed runs first.',
      );
    }
  }
}
