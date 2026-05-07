import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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
    const {
      action,
      userId,
      dateFrom,
      dateTo,
      route,
      method,
      statusCode,
      page = 1,
      limit = 20,
    } = query;
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
    if (route) {
      qb.andWhere('log.resource ILIKE :route', { route: `%${route}%` });
    }
    if (method) {
      qb.andWhere(`log.details->>'method' = :method`, {
        method: method.toUpperCase(),
      });
    }
    if (statusCode !== undefined) {
      qb.andWhere(`CAST(log.details->>'statusCode' AS INTEGER) = :statusCode`, {
        statusCode,
      });
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

  async getUserActivityLogs(userId: string, query: AuditLogQueryDto) {
    return this.getAuditLogs({
      ...query,
      userId,
    });
  }

  async exportAuditLogs(query: AuditLogQueryDto) {
    const result = await this.getAuditLogs({
      ...query,
      page: 1,
      limit: 10000,
    });

    const rows = [
      [
        'id',
        'createdAt',
        'userId',
        'action',
        'resource',
        'method',
        'statusCode',
        'ipAddress',
        'userAgent',
      ],
      ...result.logs.map((log) => [
        log.id,
        log.createdAt?.toISOString?.() || '',
        log.userId || '',
        log.action,
        log.resource,
        String(log.details?.method || ''),
        String(log.details?.statusCode || ''),
        log.ipAddress || '',
        (log.userAgent || '').replace(/\r?\n/g, ' '),
      ]),
    ];

    return rows
      .map((row) => row.map((value) => this.escapeCsv(String(value ?? ''))).join(','))
      .join('\n');
  }

  async cleanupAuditLogs(days = 90, dryRun = false) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const count = await this.auditLogRepository.count({
      where: {
        createdAt: LessThan(cutoff),
      },
    });

    if (dryRun) {
      return {
        dryRun: true,
        cutoff,
        deleted: 0,
        matched: count,
      };
    }

    const result = await this.auditLogRepository.delete({
      createdAt: LessThan(cutoff),
    });

    return {
      dryRun: false,
      cutoff,
      deleted: result.affected || 0,
      matched: count,
    };
  }

  async getFailedLoginAttempts() {
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
    const lockedUsers = await this.usersRepository
      .createQueryBuilder('user')
      .where(
        "CAST(user.securitySettings->>'failedLoginAttempts' AS INTEGER) >= 3",
      )
      .getMany();

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

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
