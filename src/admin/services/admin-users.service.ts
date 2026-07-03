import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Session } from '../../auth/entities/session.entity';
import { Role } from '../../auth/entities/role.entity';
import { Business, BusinessType } from '../../business/entities/business.entity';
import {
  BankAccount,
  SyncStatus,
} from '../../finance/entities/bank-account.entity';
import { MonoAccount } from '../../mono/entities/mono-account.entity';
import { Subscription } from '../../payments/entities/subscription.entity';
import { PaymentTransaction } from '../../payments/entities/payment-transaction.entity';
import { EncryptionService } from '../../security/encryption.service';
import {
  AdminQueryDto,
  AdminResetUserPasswordDto,
  AdminUserSubscriptionHistoryQueryDto,
  AdminUpdateUserDto,
} from '../dto';
import * as crypto from 'crypto';

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
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(MonoAccount)
    private readonly monoAccountsRepository: Repository<MonoAccount>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentTransactionsRepository: Repository<PaymentTransaction>,
    private readonly encryptionService: EncryptionService,
  ) {}

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private hashResetCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

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

    const resetToken = this.generateOtp();
    const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.resetPasswordToken = this.hashResetCode(resetToken);
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
    user.securitySettings = {
      ...user.securitySettings,
      deletedAt: new Date(),
    };
    await this.usersRepository.save(user);

    await this.sessionsRepository.update({ userId }, { revokedAt: new Date() });

    this.logger.log(`User ${userId} soft-deleted`);

    return { message: 'User deactivated successfully', userId };
  }

  async findAllUsers(query: AdminQueryDto) {
    const {
      search,
      status,
      role,
      businessType,
      planType,
      bankConnectionStatus,
      accountStatus,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;
    const normalizedSortOrder =
      String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoin('user.roles', 'role')
      .leftJoin('user.business', 'business')
      .addSelect('business.id', 'businessId')
      .addSelect('business.name', 'businessName')
      .addSelect('business.businessType', 'businessType')
      .addSelect(
        `(SELECT COUNT(*)::int FROM mono_accounts ma WHERE ma."userId" = user.id AND COALESCE(ma."dataStatus", 'CONNECTED') != 'DISCONNECTED') +
         (SELECT COUNT(*)::int FROM bank_accounts ba WHERE ba."userId" = user.id AND ba."syncStatus" != 'DISCONNECTED')`,
        'banksLinked',
      )
      .addSelect(
        `(SELECT MAX(s."lastActiveAt") FROM sessions s WHERE s."userId" = user.id)`,
        'lastActive',
      )
      .addSelect(
        `(SELECT p.name
          FROM subscriptions sub
          INNER JOIN plans p ON p.id = sub."planId"
          WHERE sub."userId" = user.id AND sub.status = 'active'
          ORDER BY sub."createdAt" DESC
          LIMIT 1)`,
        'planName',
      )
      .addSelect(
        `(SELECT p.slug
          FROM subscriptions sub
          INNER JOIN plans p ON p.id = sub."planId"
          WHERE sub."userId" = user.id AND sub.status = 'active'
          ORDER BY sub."createdAt" DESC
          LIMIT 1)`,
        'planSlug',
      )
      .skip(skip)
      .take(limit);

    if (search) {
      qb.andWhere(
        '(CAST(user.id AS TEXT) ILIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR CONCAT(user.firstName, \' \', user.lastName) ILIKE :search OR business.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const resolvedStatus = accountStatus || status;
    if (resolvedStatus) {
      switch (resolvedStatus) {
        case 'active':
          qb.andWhere('user.isActive = :isActive', { isActive: true });
          break;
        case 'inactive':
          qb.andWhere('user.isActive = :isActive', { isActive: false });
          break;
        case 'suspended':
          qb.andWhere('user.isActive = :isActive', { isActive: false });
          break;
        case 'deleted':
          qb.andWhere("user.securitySettings ? 'deletedAt'");
          break;
      }
    }

    if (role) {
      qb.andWhere('role.name = :roleName', { roleName: role });
    }

    if (businessType) {
      qb.andWhere('business.businessType = :businessType', { businessType });
    }

    if (planType) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM subscriptions sub
          INNER JOIN plans p ON p.id = sub."planId"
          WHERE sub."userId" = user.id
            AND sub.status = 'active'
            AND (p.slug ILIKE :planType OR p.name ILIKE :planType)
        )`,
        { planType: `%${planType}%` },
      );
    }

    if (bankConnectionStatus) {
      const linkedBankCountSql = `(
        (SELECT COUNT(*)::int FROM mono_accounts ma WHERE ma."userId" = user.id AND COALESCE(ma."dataStatus", 'CONNECTED') != 'DISCONNECTED') +
        (SELECT COUNT(*)::int FROM bank_accounts ba WHERE ba."userId" = user.id AND ba."syncStatus" != 'DISCONNECTED')
      )`;

      if (bankConnectionStatus === 'connected') {
        qb.andWhere(`${linkedBankCountSql} > 0`);
      } else if (
        bankConnectionStatus === 'disconnected' ||
        bankConnectionStatus === 'not_connected'
      ) {
        qb.andWhere(`${linkedBankCountSql} = 0`);
      }
    }

    const sortMap: Record<string, string> = {
      name: 'user.firstName',
      createdAt: 'user.createdAt',
      plan: '"planName"',
      banksLinked: '"banksLinked"',
      lastActive: '"lastActive"',
      businessType: 'business.businessType',
      accountStatus: 'user.isActive',
    };
    qb.orderBy(sortMap[sortBy] || 'user.createdAt', normalizedSortOrder);

    const [users, total] = await qb.getManyAndCount();
    const rawRows = await qb.getRawMany();
    const rawByUserId = new Map(rawRows.map((row) => [row.user_id, row]));

    return {
      users: users.map((user) => {
        const raw = rawByUserId.get(user.id) || {};
        const accountStatusValue = this.getAccountStatus(user);
        const banksLinked = Number(raw.banksLinked || 0);

        return {
          id: user.id,
          name: [user.firstName, user.lastName].filter(Boolean).join(' '),
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          dateCreated: user.createdAt,
          createdAt: user.createdAt,
          plan: raw.planName
            ? { name: raw.planName, slug: raw.planSlug }
            : null,
          business: {
            id: raw.businessId || null,
            name: raw.businessName || null,
            businessType: raw.businessType || null,
          },
          businessType: raw.businessType || null,
          banksLinked,
          bankConnectionStatus: banksLinked > 0 ? 'connected' : 'not_connected',
          lastActive: raw.lastActive || null,
          accountStatus: accountStatusValue,
          isVerified: user.isVerified,
          isActive: user.isActive,
          actions: this.getUserManagementActions(user, banksLinked),
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateUser(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['business'],
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('Email address is already in use');
      }
      user.email = normalizedEmail;
    }

    if (dto.username && !dto.firstName && !dto.lastName) {
      const [firstName, ...rest] = dto.username.trim().split(/\s+/);
      user.firstName = firstName || user.firstName;
      user.lastName = rest.join(' ') || user.lastName;
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    await this.usersRepository.save(user);

    if (dto.businessName !== undefined || dto.businessType !== undefined) {
      let business =
        user.business ||
        (await this.businessRepository.findOne({ where: { userId } }));

      if (!business) {
        business = this.businessRepository.create({
          userId,
          owner: user,
          name:
            dto.businessName?.trim() ||
            `${user.firstName || user.email || 'User'}'s Business`,
          businessType:
            dto.businessType || BusinessType.SOLE_PROPRIETORSHIP,
        });
      } else {
        if (dto.businessName !== undefined) business.name = dto.businessName;
        if (dto.businessType !== undefined) business.businessType = dto.businessType;
      }

      await this.businessRepository.save(business);
    }

    return this.getUserManagementDetail(userId);
  }

  async resetUserPassword(userId: string, dto: AdminResetUserPasswordDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await this.encryptionService.hashPassword(
      dto.newPassword,
    );
    user.passwordHash = passwordHash;
    user.resetPasswordToken = null as any;
    user.resetPasswordExpires = null as any;
    user.securitySettings = {
      ...user.securitySettings,
      lastPasswordChange: new Date(),
      mfaEnabled: user.securitySettings?.mfaEnabled ?? false,
    };

    await this.usersRepository.save(user);
    await this.sessionsRepository.update({ userId }, { revokedAt: new Date() });

    return { message: 'User password reset successfully', userId: user.id };
  }

  async disconnectUserBankAccount(userId: string, accountId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const monoAccount = await this.monoAccountsRepository.findOne({
      where: { id: accountId, user: { id: userId } },
      relations: ['user'],
    });

    if (monoAccount) {
      monoAccount.dataStatus = 'DISCONNECTED';
      await this.monoAccountsRepository.save(monoAccount);
      return {
        message: 'Bank account disconnected',
        userId,
        accountId,
        accountType: 'mono',
      };
    }

    const bankAccount = await this.bankAccountsRepository.findOne({
      where: { id: accountId, userId },
    });

    if (bankAccount) {
      bankAccount.syncStatus = SyncStatus.DISCONNECTED;
      await this.bankAccountsRepository.save(bankAccount);
      return {
        message: 'Bank account disconnected',
        userId,
        accountId,
        accountType: 'bank_account',
      };
    }

    throw new NotFoundException('Bank account not found for user');
  }

  async getUserSubscriptionHistory(
    userId: string,
    query: AdminUserSubscriptionHistoryQueryDto,
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const { status, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const qb = this.subscriptionsRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .where('subscription."userId" = :userId', { userId })
      .orderBy('subscription.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      qb.andWhere('subscription.status = :status', { status });
    }

    if (dateFrom) {
      qb.andWhere('subscription.createdAt >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }

    if (dateTo) {
      qb.andWhere('subscription.createdAt <= :dateTo', {
        dateTo: new Date(dateTo),
      });
    }

    const [subscriptions, total] = await qb.getManyAndCount();

    const payments = await this.paymentTransactionsRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      },
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        plan: subscription.plan
          ? {
              id: subscription.plan.id,
              name: subscription.plan.name,
              slug: subscription.plan.slug,
              price: Number(subscription.plan.price),
              currency: subscription.plan.currency,
              interval: subscription.plan.interval,
            }
          : null,
        gatewaySubscriptionId: subscription.gatewaySubscriptionId || undefined,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        gateway: payment.gateway,
        reference: payment.reference,
        gatewayReference: payment.gatewayReference || undefined,
        status: payment.status,
        paymentMethod: payment.paymentMethod || undefined,
        metadata: payment.metadata || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
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

  private async getUserManagementDetail(userId: string) {
    const result = await this.findAllUsers({
      search: userId,
      page: 1,
      limit: 1,
    });

    const exact = result.users.find((user) => user.id === userId);
    if (exact) return exact;

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      dateCreated: user.createdAt,
      createdAt: user.createdAt,
      accountStatus: this.getAccountStatus(user),
      isVerified: user.isVerified,
      isActive: user.isActive,
    };
  }

  private getAccountStatus(user: User) {
    if (user.securitySettings?.deletedAt) return 'deleted';
    if (user.isActive) return 'active';
    return 'inactive';
  }

  private getUserManagementActions(user: User, banksLinked: number) {
    const actions = ['view', 'edit', 'reset_password'];

    if (user.isActive) {
      actions.push('deactivate');
    } else {
      actions.push('activate');
    }

    if (banksLinked > 0) {
      actions.push('disconnect_bank');
    }

    return actions;
  }
}
