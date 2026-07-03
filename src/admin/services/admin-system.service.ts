import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SystemSetting } from '../entities/system-setting.entity';
import { SupportTicket } from '../entities/support-ticket.entity';
import { SupportTicketReply } from '../entities/support-ticket-reply.entity';
import { Dispute } from '../entities/dispute.entity';
import { WebhookLog } from '../entities/webhook-log.entity';
import { User } from '../../auth/entities/user.entity';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { StorageService } from '../../storage/storage.service';
import { EmailService } from '../../email/email.service';
import { IntegrationWebhookService } from '../../integrations/services/integration-webhook.service';
import {
  TicketQueryDto,
  DisputeQueryDto,
  WebhookQueryDto,
  UpdateTicketDto,
  ReplySupportTicketDto,
  ResolveDisputeDto,
  CreateSupportTicketDto,
  UserSupportTicketQueryDto,
} from '../dto';

@Injectable()
export class AdminSystemService {
  private readonly logger = new Logger(AdminSystemService.name);
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
    @InjectRepository(SupportTicket)
    private readonly ticketsRepository: Repository<SupportTicket>,
    @InjectRepository(SupportTicketReply)
    private readonly ticketRepliesRepository: Repository<SupportTicketReply>,
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    @InjectRepository(WebhookLog)
    private readonly webhookLogRepository: Repository<WebhookLog>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly emailService: EmailService,
    private readonly integrationWebhookService: IntegrationWebhookService,
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
    const {
      status,
      priority,
      category,
      search,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const qb = this.ticketsRepository
      .createQueryBuilder('ticket')
      .leftJoin(User, 'user', 'user.id = ticket.userId')
      .addSelect('user.email', 'userEmail')
      .addSelect('user.firstName', 'userFirstName')
      .addSelect('user.lastName', 'userLastName')
      .orderBy('ticket.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('ticket.status = :status', { status });
    }
    if (priority) {
      qb.andWhere('ticket.priority = :priority', { priority });
    }
    if (category) {
      qb.andWhere('ticket.category = :category', { category });
    }
    if (search) {
      qb.andWhere(
        '(ticket.subject ILIKE :search OR ticket.description ILIKE :search OR ticket.category ILIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (dateFrom) {
      qb.andWhere('ticket.createdAt >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }
    if (dateTo) {
      qb.andWhere('ticket.createdAt <= :dateTo', {
        dateTo: new Date(dateTo),
      });
    }

    const { entities: tickets, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const rawByTicketId = new Map(raw.map((row) => [row.ticket_id, row]));

    return {
      tickets: tickets.map((ticket) => {
        const row = rawByTicketId.get(ticket.id) || {};
        return {
          ...this.mapSupportTicket(ticket),
          user: {
            id: ticket.userId,
            email: row.userEmail || null,
            firstName: row.userFirstName || null,
            lastName: row.userLastName || null,
            name: [row.userFirstName, row.userLastName]
              .filter(Boolean)
              .join(' '),
          },
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

  async getTicketStats() {
    const rows = await this.ticketsRepository
      .createQueryBuilder('ticket')
      .select('ticket.status', 'status')
      .addSelect('COUNT(ticket.id)', 'count')
      .groupBy('ticket.status')
      .getRawMany();

    const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      total,
      pending: byStatus.open || 0,
      inProgress: byStatus.in_progress || 0,
      closed: (byStatus.closed || 0) + (byStatus.resolved || 0),
      byStatus,
    };
  }

  async getAdminSupportTicket(id: string) {
    const ticket = await this.ticketsRepository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    return this.mapSupportTicketDetail(ticket);
  }

  async replyToSupportTicket(
    id: string,
    adminId: string,
    dto: ReplySupportTicketDto,
    attachment?: any,
  ) {
    const ticket = await this.ticketsRepository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    let attachmentUrl: string | undefined;
    if (attachment) {
      attachmentUrl = await this.storageService.uploadFile(
        attachment,
        'support-ticket-replies',
      );
    }

    const reply = this.ticketRepliesRepository.create({
      ticketId: id,
      senderId: adminId,
      senderType: 'admin',
      message: dto.message,
      attachmentUrl: attachmentUrl || null,
    });
    await this.ticketRepliesRepository.save(reply);

    ticket.status = dto.status || 'in_progress';
    ticket.assignedTo = ticket.assignedTo || adminId;
    await this.ticketsRepository.save(ticket);

    return this.mapSupportTicketDetail(ticket);
  }

  async sendUncategorizedTransactionReminders(dryRun = false) {
    const targets = await this.dataSource.query(
      `
        SELECT
          u.id,
          u.email,
          u."firstName" AS "firstName",
          u."lastName" AS "lastName",
          u."notificationPreferences" AS "notificationPreferences",
          SUM(reminders.count)::int AS "uncategorizedCount"
        FROM users u
        INNER JOIN (
          SELECT
            ma."userId" AS "userId",
            COUNT(*)::int AS count
          FROM mono_transactions mt
          INNER JOIN mono_accounts ma
            ON ma.id = mt."monoAccountId"
          WHERE mt."isCategorised" = false
            AND ma."userId" IS NOT NULL
          GROUP BY ma."userId"

          UNION ALL

          SELECT
            tx."userId" AS "userId",
            COUNT(*)::int AS count
          FROM transactions tx
          WHERE tx."isCategorised" = false
            AND tx."userId" IS NOT NULL
          GROUP BY tx."userId"
        ) reminders
          ON reminders."userId" = u.id
        WHERE u.email IS NOT NULL
        GROUP BY u.id, u.email, u."firstName", u."lastName", u."notificationPreferences"
        ORDER BY "uncategorizedCount" DESC, u.email ASC
      `,
    );

    const recipients = targets
      .map((target: any) => ({
        userId: target.id,
        email: target.email,
        firstName: target.firstName || null,
        lastName: target.lastName || null,
        uncategorizedCount: Number(target.uncategorizedCount || 0),
        notificationPreferences: target.notificationPreferences || null,
      }))
      .filter(
        (recipient) =>
          recipient.notificationPreferences?.reminders?.email !== false,
      );

    if (dryRun) {
      return {
        message: 'Dry run completed',
        dryRun: true,
        targetedUsers: recipients.length,
        sent: 0,
        failed: 0,
        recipients,
      };
    }

    const dashboardUrl = this.buildTransactionsUrl();
    const sent: string[] = [];
    const failed: Array<{ email: string; reason: string }> = [];

    for (const recipient of recipients) {
      try {
        await this.emailService.sendUncategorizedTransactionsReminderEmail(
          recipient.email,
          recipient.firstName || recipient.lastName || undefined,
          recipient.uncategorizedCount,
          dashboardUrl,
        );
        sent.push(recipient.email);
      } catch (error) {
        failed.push({
          email: recipient.email,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.log(
      `Processed uncategorized transaction reminders: ${sent.length} sent, ${failed.length} failed`,
    );

    return {
      message: 'Reminder processing completed',
      dryRun: false,
      targetedUsers: recipients.length,
      sent: sent.length,
      failed: failed.length,
      recipients: recipients.map((recipient) => ({
        ...recipient,
        status: sent.includes(recipient.email) ? 'sent' : 'failed',
      })),
      failures: failed,
    };
  }

  async createUserSupportTicket(
    userId: string,
    dto: CreateSupportTicketDto,
    attachment?: any,
  ) {
    let attachmentUrl: string | undefined;
    if (attachment) {
      attachmentUrl = await this.storageService.uploadFile(
        attachment,
        'support-tickets',
      );
    }

    const ticket = this.ticketsRepository.create({
      userId,
      subject: dto.title,
      description: dto.description,
      category: dto.category || dto.type || 'request',
      attachmentUrl,
      status: 'open',
      priority: 'medium',
    });

    const saved = await this.ticketsRepository.save(ticket);
    return this.mapSupportTicket(saved);
  }

  async getUserSupportTickets(
    userId: string,
    query: UserSupportTicketQueryDto,
  ) {
    const { status, category, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.ticketsRepository
      .createQueryBuilder('ticket')
      .where('ticket.userId = :userId', { userId })
      .orderBy('ticket.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('ticket.status = :status', { status });
    }
    if (category) {
      qb.andWhere('ticket.category = :category', { category });
    }

    const [tickets, total] = await qb.getManyAndCount();

    return {
      tickets: tickets.map((ticket) => this.mapSupportTicket(ticket)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserSupportTicket(userId: string, id: string) {
    const ticket = await this.ticketsRepository.findOne({
      where: { id, userId },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    return this.mapSupportTicket(ticket);
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

    if (log.source === 'integrations.outbound') {
      return this.integrationWebhookService.retryWebhookLog(id);
    }

    throw new BadRequestException(
      'Retry is only implemented for outbound integration webhooks.',
    );
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

  private buildTransactionsUrl() {
    const appUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:3000';

    return new URL('/transactions', appUrl).toString();
  }

  private mapSupportTicket(ticket: SupportTicket) {
    return {
      id: ticket.id,
      title: ticket.subject,
      description: ticket.description,
      category: ticket.category || 'request',
      attachmentUrl: ticket.attachmentUrl || undefined,
      status: ticket.status,
      priority: ticket.priority,
      resolution: ticket.resolution || undefined,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  private async mapSupportTicketDetail(ticket: SupportTicket) {
    const [user, replies] = await Promise.all([
      this.usersRepository.findOne({ where: { id: ticket.userId } }),
      this.ticketRepliesRepository.find({
        where: { ticketId: ticket.id },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const participantIds = Array.from(
      new Set(replies.map((reply) => reply.senderId).filter(Boolean)),
    );
    const participants =
      participantIds.length > 0
        ? await this.usersRepository
            .createQueryBuilder('user')
            .where('user.id IN (:...participantIds)', { participantIds })
            .getMany()
        : [];
    const participantsById = new Map(
      participants.map((participant) => [participant.id, participant]),
    );

    return {
      ...this.mapSupportTicket(ticket),
      user: user
        ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: [user.firstName, user.lastName].filter(Boolean).join(' '),
          }
        : { id: ticket.userId },
      messages: [
        {
          id: ticket.id,
          senderType: 'user',
          senderId: ticket.userId,
          senderName: user
            ? [user.firstName, user.lastName].filter(Boolean).join(' ')
            : '',
          message: ticket.description,
          attachmentUrl: ticket.attachmentUrl || undefined,
          createdAt: ticket.createdAt,
        },
        ...replies.map((reply) => {
          const sender = participantsById.get(reply.senderId);
          return {
            id: reply.id,
            senderType: reply.senderType,
            senderId: reply.senderId,
            senderName: sender
              ? [sender.firstName, sender.lastName].filter(Boolean).join(' ')
              : reply.senderType === 'admin'
                ? 'MyTrackr'
                : '',
            message: reply.message,
            attachmentUrl: reply.attachmentUrl || undefined,
            createdAt: reply.createdAt,
          };
        }),
      ],
    };
  }
}
