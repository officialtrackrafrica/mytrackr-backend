import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { User } from '../../auth/entities/user.entity';
import { AuditLogQueryDto } from '../dto';

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async log(
    action: string,
    resource: string,
    resourceId: string | null,
    userId: string | null,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const entry = this.auditLogRepository.create({
      action,
      resource,
      resourceId: resourceId || undefined,
      userId: userId || undefined,
      details,
      ipAddress,
      userAgent,
    });

    await this.auditLogRepository.save(entry);
    this.logger.log(
      `Audit: ${action} on ${resource}/${resourceId} by ${userId}`,
    );
    return entry;
  }

  async getAuditLogs(query: AuditLogQueryDto) {
    const { action, userId, dateFrom, dateTo, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.auditLogRepository
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (userId) {
      qb.andWhere('log.userId = :userId', { userId });
    }
    if (dateFrom) {
      qb.andWhere('log.createdAt >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }
    if (dateTo) {
      qb.andWhere('log.createdAt <= :dateTo', { dateTo: new Date(dateTo) });
    }

    const [logs, total] = await qb.getManyAndCount();

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFailedLoginAttempts() {
    // Query users who have failed login attempts
    const users = await this.usersRepository
      .createQueryBuilder('user')
      .where(
        "CAST(user.securitySettings->>'failedLoginAttempts' AS INTEGER) > 0",
      )
      .orderBy(
        "CAST(user.securitySettings->>'failedLoginAttempts' AS INTEGER)",
        'DESC',
      )
      .getMany();

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      failedAttempts: user.securitySettings?.failedLoginAttempts || 0,
      lockoutUntil: user.securitySettings?.lockoutUntil || null,
      isLocked: user.securitySettings?.lockoutUntil
        ? new Date(user.securitySettings.lockoutUntil) > new Date()
        : false,
    }));
  }

  async getSuspiciousActivity() {
    // Get users with multiple failed login attempts (threshold: 3+)
    const lockedUsers = await this.usersRepository
      .createQueryBuilder('user')
      .where(
        "CAST(user.securitySettings->>'failedLoginAttempts' AS INTEGER) >= 3",
      )
      .getMany();

    // Get recent audit logs that might indicate suspicious behavior
    const suspiciousLogs = await this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.action IN (:...actions)', {
        actions: [
          'LOGIN_FAILED',
          'USER_SUSPENDED',
          'PASSWORD_RESET_FORCED',
          'TRANSACTION_FLAGGED',
          'ACCOUNT_LOCKED',
        ],
      })
      .orderBy('log.createdAt', 'DESC')
      .take(50)
      .getMany();

    return {
      lockedAccounts: lockedUsers.map((u) => ({
        id: u.id,
        email: u.email,
        failedAttempts: u.securitySettings?.failedLoginAttempts || 0,
        lockoutUntil: u.securitySettings?.lockoutUntil,
      })),
      recentAlerts: suspiciousLogs,
    };
  }
}
