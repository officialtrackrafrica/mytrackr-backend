import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Subscription } from '../../payments/entities/subscription.entity';
import { EmailService } from '../../email/email.service';
import { AdminMessage } from '../entities/admin-message.entity';
import { AdminMessageTemplate } from '../entities/admin-message-template.entity';
import {
  AdminMessageQueryDto,
  AdminMessageTemplateQueryDto,
  ComposeAdminMessageDto,
  CreateAdminMessageTemplateDto,
  SaveAdminMessageDraftDto,
  UpdateAdminMessageTemplateDto,
} from '../dto';

@Injectable()
export class AdminMessagingService {
  constructor(
    @InjectRepository(AdminMessage)
    private readonly messagesRepository: Repository<AdminMessage>,
    @InjectRepository(AdminMessageTemplate)
    private readonly templatesRepository: Repository<AdminMessageTemplate>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    private readonly emailService: EmailService,
  ) {}

  async listMessages(query: AdminMessageQueryDto) {
    const { channel, status, search, page = 1, limit = 20 } = query;
    const qb = this.messagesRepository
      .createQueryBuilder('message')
      .orderBy('message.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (channel) qb.andWhere('message.channel = :channel', { channel });
    if (status) qb.andWhere('message.status = :status', { status });
    if (search) {
      qb.andWhere(
        '(message.subject ILIKE :search OR message.body ILIKE :search OR CAST(message.recipients AS TEXT) ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [messages, total] = await qb.getManyAndCount();
    return {
      messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async composeMessage(adminId: string, dto: ComposeAdminMessageDto) {
    const channel = dto.channel || 'email';
    const template = dto.templateId
      ? await this.templatesRepository.findOne({ where: { id: dto.templateId } })
      : null;

    if (dto.templateId && !template) {
      throw new NotFoundException('Message template not found');
    }

    const subject = dto.subject || template?.subject || '';
    const body = dto.body || template?.body || '';
    const recipients = await this.resolveRecipients(dto);

    const message = this.messagesRepository.create({
      channel,
      status: 'sent',
      recipientGroup: dto.recipientGroup || 'all_users',
      recipients,
      subject,
      body,
      metadata: dto.metadata || template?.metadata || null,
      templateId: template?.id || null,
      createdBy: adminId,
      sentAt: new Date(),
    });

    const saved = await this.messagesRepository.save(message);

    let sent = 0;
    const failed: Array<{ recipient: string; reason: string }> = [];

    if (channel === 'email') {
      for (const recipient of recipients) {
        try {
          await this.emailService.sendCustomEmail(recipient, subject, body);
          sent++;
        } catch (error) {
          failed.push({
            recipient,
            reason: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } else {
      sent = recipients.length;
      saved.metadata = {
        ...(saved.metadata || {}),
        deliveryNote:
          'Push notification delivery is queued/logged for provider integration.',
      };
      await this.messagesRepository.save(saved);
    }

    if (failed.length > 0) {
      saved.status = sent > 0 ? 'sent' : 'failed';
      saved.metadata = { ...(saved.metadata || {}), failures: failed };
      await this.messagesRepository.save(saved);
    }

    let savedTemplate: AdminMessageTemplate | null = null;
    if (dto.saveAsTemplate !== false) {
      savedTemplate = await this.createTemplate(adminId, {
        channel,
        name: dto.templateName || subject,
        subject,
        body,
        metadata: dto.metadata,
      });
    }

    return {
      message: saved,
      template: savedTemplate,
      delivery: {
        totalRecipients: recipients.length,
        sent,
        failed: failed.length,
        failures: failed,
      },
    };
  }

  async saveDraft(adminId: string, dto: SaveAdminMessageDraftDto) {
    const message = this.messagesRepository.create({
      channel: dto.channel || 'email',
      status: 'draft',
      recipientGroup: dto.recipientGroup || 'all_users',
      recipients: dto.recipients || [],
      subject: dto.subject,
      body: dto.body,
      metadata: dto.metadata || null,
      templateId: dto.templateId || null,
      createdBy: adminId,
    });

    return this.messagesRepository.save(message);
  }

  async updateDraft(id: string, dto: SaveAdminMessageDraftDto) {
    const message = await this.messagesRepository.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.status !== 'draft') {
      throw new NotFoundException('Draft not found');
    }

    Object.assign(message, {
      channel: dto.channel || message.channel,
      recipientGroup: dto.recipientGroup ?? message.recipientGroup,
      recipients: dto.recipients ?? message.recipients,
      subject: dto.subject ?? message.subject,
      body: dto.body ?? message.body,
      metadata: dto.metadata ?? message.metadata,
      templateId: dto.templateId ?? message.templateId,
    });

    return this.messagesRepository.save(message);
  }

  async moveToTrash(id: string) {
    const message = await this.messagesRepository.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Message not found');

    message.status = 'trash';
    message.trashedAt = new Date();
    return this.messagesRepository.save(message);
  }

  async restoreFromTrash(id: string) {
    const message = await this.messagesRepository.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Message not found');

    message.status = message.sentAt ? 'sent' : 'draft';
    message.trashedAt = null;
    return this.messagesRepository.save(message);
  }

  async listTemplates(query: AdminMessageTemplateQueryDto) {
    const { channel, search, page = 1, limit = 20 } = query;
    const qb = this.templatesRepository
      .createQueryBuilder('template')
      .where('template.isActive = true')
      .orderBy('template.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (channel) qb.andWhere('template.channel = :channel', { channel });
    if (search) {
      qb.andWhere(
        '(template.name ILIKE :search OR template.subject ILIKE :search OR template.body ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [templates, total] = await qb.getManyAndCount();
    return {
      templates,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createTemplate(adminId: string, dto: CreateAdminMessageTemplateDto) {
    const template = this.templatesRepository.create({
      channel: dto.channel || 'email',
      name: dto.name,
      subject: dto.subject,
      body: dto.body,
      metadata: dto.metadata || null,
      createdBy: adminId,
    });

    return this.templatesRepository.save(template);
  }

  async updateTemplate(id: string, dto: UpdateAdminMessageTemplateDto) {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Message template not found');

    Object.assign(template, dto);
    return this.templatesRepository.save(template);
  }

  async deleteTemplate(id: string) {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Message template not found');

    template.isActive = false;
    return this.templatesRepository.save(template);
  }

  private async resolveRecipients(dto: ComposeAdminMessageDto) {
    if (dto.recipients?.length) {
      return Array.from(new Set(dto.recipients.map((value) => value.trim())))
        .filter(Boolean);
    }

    const group = dto.recipientGroup || 'all_users';
    const userQb = this.usersRepository
      .createQueryBuilder('user')
      .where('user.email IS NOT NULL');

    if (group === 'active_users') {
      userQb.andWhere('user.isActive = true');
    } else if (group === 'inactive_users') {
      userQb.andWhere('user.isActive = false');
    } else if (group === 'subscribers') {
      userQb.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('sub."userId"')
          .from(Subscription, 'sub')
          .where('sub.status = :activeStatus')
          .getQuery();
        return `user.id IN ${subQuery}`;
      });
      userQb.setParameter('activeStatus', 'active');
    }

    const users = await userQb.getMany();
    return users
      .map((user) => user.email)
      .filter((email): email is string => Boolean(email));
  }
}
