import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SystemSetting } from '../entities/system-setting.entity';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { SupportTicket } from '../entities/support-ticket.entity';
import { Dispute } from '../entities/dispute.entity';
import { WebhookLog } from '../entities/webhook-log.entity';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import {
  TicketQueryDto,
  DisputeQueryDto,
  WebhookQueryDto,
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
  UpdateTicketDto,
  ResolveDisputeDto,
} from '../dto';

@Injectable()
export class AdminSystemService {
  private readonly logger = new Logger(AdminSystemService.name);
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
    @InjectRepository(NotificationTemplate)
    private readonly templatesRepository: Repository<NotificationTemplate>,
    @InjectRepository(SupportTicket)
    private readonly ticketsRepository: Repository<SupportTicket>,
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    @InjectRepository(WebhookLog)
    private readonly webhookLogRepository: Repository<WebhookLog>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.initRedis();
  }

  private initRedis() {
    try {
      const url = this.configService.get<string>('REDIS_URL');
      if (url) {
        this.redis = new Redis(url, { maxRetriesPerRequest: 3 });
      } else {
        this.redis = new Redis({
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          maxRetriesPerRequest: 3,
        });
      }
    } catch {
      this.logger.warn('Redis connection failed for admin system service');
    }
  }

  async getSettings() {
    const settings = await this.settingsRepository.find({
      order: { category: 'ASC', key: 'ASC' },
    });
    return settings;
  }

  async updateSetting(key: string, value: any, adminId: string) {
    let setting = await this.settingsRepository.findOne({ where: { key } });

    if (!setting) {
      setting = this.settingsRepository.create({
        key,
        value,
        updatedBy: adminId,
      });
    } else {
      setting.value = value;
      setting.updatedBy = adminId;
    }

    await this.settingsRepository.save(setting);
    return setting;
  }

  async getFeatureFlags() {
    const flags = await this.settingsRepository.find({
      where: { category: 'features' },
      order: { key: 'ASC' },
    });
    return flags;
  }

  async toggleFeatureFlag(key: string, enabled: boolean, adminId: string) {
    let flag = await this.settingsRepository.findOne({
      where: { key, category: 'features' },
    });

    if (!flag) {
      flag = this.settingsRepository.create({
        key,
        value: { enabled },
        category: 'features',
        description: `Feature flag: ${key}`,
        updatedBy: adminId,
      });
    } else {
      flag.value = { enabled };
      flag.updatedBy = adminId;
    }

    await this.settingsRepository.save(flag);
    return flag;
  }

  async getNotificationTemplates() {
    return this.templatesRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createNotificationTemplate(dto: CreateNotificationTemplateDto) {
    const template = this.templatesRepository.create(dto);
    return this.templatesRepository.save(template);
  }

  async updateNotificationTemplate(
    id: string,
    dto: UpdateNotificationTemplateDto,
  ) {
    const template = await this.templatesRepository.findOne({
      where: { id },
    });
    if (!template) throw new NotFoundException('Template not found');

    Object.assign(template, dto);
    return this.templatesRepository.save(template);
  }

  broadcastNotification(
    title: string,
    message: string,
    channel: string,
    filters?: Record<string, any>,
  ) {
    this.logger.log(`Broadcasting notification: "${title}" via ${channel}`);

    return {
      message: 'Broadcast notification queued',
      title,
      channel,
      filters: filters || {},
      queuedAt: new Date(),
    };
  }

  async getTickets(query: TicketQueryDto) {
    const { status, priority, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.ticketsRepository
      .createQueryBuilder('ticket')
      .orderBy('ticket.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('ticket.status = :status', { status });
    }
    if (priority) {
      qb.andWhere('ticket.priority = :priority', { priority });
    }

    const [tickets, total] = await qb.getManyAndCount();

    return {
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateTicket(id: string, dto: UpdateTicketDto) {
    const ticket = await this.ticketsRepository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    Object.assign(ticket, dto);
    return this.ticketsRepository.save(ticket);
  }

  async getDisputes(query: DisputeQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.disputesRepository
      .createQueryBuilder('dispute')
      .orderBy('dispute.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('dispute.status = :status', { status });
    }

    const [disputes, total] = await qb.getManyAndCount();

    return {
      disputes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto, adminId: string) {
    const dispute = await this.disputesRepository.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');

    dispute.resolution = dto.resolution;
    dispute.status = dto.status;
    dispute.resolvedBy = adminId;
    return this.disputesRepository.save(dispute);
  }

  async getWebhookLogs(query: WebhookQueryDto) {
    const { source, event, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.webhookLogRepository
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (source) {
      qb.andWhere('log.source = :source', { source });
    }
    if (event) {
      qb.andWhere('log.event = :event', { event });
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

  async getFailedWebhooks() {
    const logs = await this.webhookLogRepository.find({
      where: { status: 'failed' },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return logs;
  }

  async retryWebhook(id: string) {
    const log = await this.webhookLogRepository.findOne({ where: { id } });
    if (!log) throw new NotFoundException('Webhook log not found');

    log.retryCount += 1;
    log.status = 'received';
    await this.webhookLogRepository.save(log);

    this.logger.log(
      `Webhook ${id} queued for retry (attempt ${log.retryCount})`,
    );

    return {
      message: 'Webhook queued for retry',
      id: log.id,
      retryCount: log.retryCount,
    };
  }

  async getSystemHealth() {
    const health: Record<string, any> = {
      status: 'healthy',
      timestamp: new Date(),
      services: {},
    };

    try {
      await this.dataSource.query('SELECT 1');
      health.services.database = { status: 'up' };
    } catch (error) {
      health.services.database = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      health.status = 'degraded';
    }

    try {
      if (this.redis) {
        await this.redis.ping();
        health.services.redis = { status: 'up' };
      } else {
        health.services.redis = {
          status: 'unknown',
          message: 'Not configured',
        };
      }
    } catch (error) {
      health.services.redis = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      health.status = 'degraded';
    }

    try {
      const monoKey = this.configService.get<string>('MONO_SECRET_KEY');
      health.services.mono = {
        status: monoKey ? 'configured' : 'not_configured',
      };
    } catch {
      health.services.mono = { status: 'unknown' };
    }

    return health;
  }

  getIntegrationsHealth() {
    const integrations: Record<string, any> = {};

    const monoKey = this.configService.get<string>('MONO_SECRET_KEY');
    integrations.mono = {
      configured: !!monoKey,
      status: monoKey ? 'active' : 'not_configured',
    };

    return integrations;
  }

  async getMetrics() {
    const [userCount, transactionCount, sessionCount, auditCount] =
      await Promise.all([
        this.dataSource.query('SELECT COUNT(*) as count FROM users'),
        this.dataSource.query(
          'SELECT COUNT(*) as count FROM mono_transactions',
        ),
        this.dataSource.query(
          'SELECT COUNT(*) as count FROM sessions WHERE "revokedAt" IS NULL',
        ),
        this.dataSource.query('SELECT COUNT(*) as count FROM audit_logs'),
      ]);

    return {
      users: parseInt(userCount[0]?.count || '0', 10),
      transactions: parseInt(transactionCount[0]?.count || '0', 10),
      activeSessions: parseInt(sessionCount[0]?.count || '0', 10),
      auditEntries: parseInt(auditCount[0]?.count || '0', 10),
      timestamp: new Date(),
    };
  }

  async getBackgroundJobs() {
    const recentWebhooks = await this.webhookLogRepository
      .createQueryBuilder('log')
      .select('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.status')
      .getRawMany();

    return {
      webhookProcessing: recentWebhooks.map((r) => ({
        status: r.status,
        count: parseInt(r.count, 10),
      })),
      timestamp: new Date(),
    };
  }

  async clearCache() {
    if (this.redis) {
      const keys = await this.redis.keys('mytrackr:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      this.logger.log(`Cleared ${keys.length} cache keys`);
      return {
        message: `Cleared ${keys.length} cache keys`,
        clearedAt: new Date(),
      };
    }

    return { message: 'No cache to clear (Redis not available)' };
  }
}
