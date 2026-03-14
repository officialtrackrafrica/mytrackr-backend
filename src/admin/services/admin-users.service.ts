import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Session } from '../../auth/entities/session.entity';
import { Role } from '../../auth/entities/role.entity';
import { EncryptionService } from '../../security/encryption.service';
import { AdminQueryDto } from '../dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async updateUserStatus(
    userId: string,
    status: 'active' | 'inactive' | 'suspended',
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    switch (status) {
      case 'active':
        user.isActive = true;
        user.isVerified = true;
        break;
      case 'inactive':
        user.isActive = false;
        break;
      case 'suspended':
        user.isActive = false;

        await this.sessionsRepository.update(
          { userId, revokedAt: undefined as any },
          { revokedAt: new Date() },
        );
        break;
    }

    await this.usersRepository.save(user);
    this.logger.log(`User ${userId} status changed to ${status}`);

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      status,
    };
  }

  async forcePasswordReset(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const resetToken =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpires;
    await this.usersRepository.save(user);

    this.logger.log(`Password reset forced for user ${userId}`);

    return {
      message: 'Password reset initiated',
      userId: user.id,
      email: user.email,
      resetToken,
      expiresAt: resetExpires,
    };
  }

  async softDeleteUser(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.isActive = false;
    user.isVerified = false;
    await this.usersRepository.save(user);

    await this.sessionsRepository.update({ userId }, { revokedAt: new Date() });

    this.logger.log(`User ${userId} soft-deleted`);

    return { message: 'User deactivated successfully', userId };
  }

  async findAllUsers(query: AdminQueryDto) {
    const { search, status, role, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (search) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      switch (status) {
        case 'active':
          qb.andWhere('user.isActive = :isActive', { isActive: true });
          break;
        case 'inactive':
          qb.andWhere('user.isActive = :isActive', { isActive: false });
          break;
        case 'suspended':
          qb.andWhere('user.isActive = :isActive', { isActive: false });
          break;
      }
    }

    if (role) {
      qb.andWhere('role.name = :roleName', { roleName: role });
    }

    const [users, total] = await qb.getManyAndCount();

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        isVerified: user.isVerified,
        isActive: user.isActive,
        roles: user.roles?.map((r) => r.name) || [],
        createdAt: user.createdAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async unlockUser(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.securitySettings = {
      ...user.securitySettings,
      failedLoginAttempts: 0,
      lockoutUntil: undefined,
    };
    await this.usersRepository.save(user);

    this.logger.log(`User ${userId} account unlocked`);

    return { message: 'User account unlocked', userId };
  }

  async getUserActivityLog(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const sessions = await this.sessionsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return {
      userId,
      email: user.email,
      activities: sessions.map((session) => ({
        sessionId: session.id,
        deviceType: session.deviceInfo?.deviceType || 'Unknown',
        deviceName: session.deviceInfo?.deviceName || 'Unknown',
        ipAddress: session.ipAddress || 'Unknown',
        location: session.location || 'Unknown',
        loginAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        revokedAt: session.revokedAt,
        isActive: !session.revokedAt,
      })),
    };
  }
}
