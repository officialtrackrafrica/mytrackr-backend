import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { WebhookLog } from '../../admin/entities/webhook-log.entity';
import { Integration } from '../entities/integration.entity';

type IntegrationWebhookEvent =
  | 'integration.created'
  | 'integration.updated'
  | 'integration.revoked'
  | 'integration.event.received';

type DeliveryEnvelope = {
  id: string;
  event: IntegrationWebhookEvent;
  createdAt: string;
  integration: {
    id: string;
    name: string;
    platform: string;
    publicKey: string;
    webhookUrl?: string;
    redirectUrl?: string;
    billingStatus: string;
    isActive: boolean;
  };
  data: Record<string, any>;
};

type LoggedWebhookPayload = {
  direction: 'outbound';
  url: string;
  body: DeliveryEnvelope;
};

const INTEGRATION_WEBHOOK_SOURCE = 'integrations.outbound';

@Injectable()
export class IntegrationWebhookService {
  private readonly logger = new Logger(IntegrationWebhookService.name);

  constructor(
    @InjectRepository(WebhookLog)
    private readonly webhookLogRepository: Repository<WebhookLog>,
    private readonly configService: ConfigService,
  ) {}

  async deliver(
    integration: Integration,
    event: IntegrationWebhookEvent,
    data: Record<string, any>,
  ) {
    if (!integration.webhookUrl) {
      return;
    }

    const body: DeliveryEnvelope = {
      id: crypto.randomUUID(),
      event,
      createdAt: new Date().toISOString(),
      integration: {
        id: integration.id,
        name: integration.name,
        platform: integration.platform,
        publicKey: integration.publicKey,
        webhookUrl: integration.webhookUrl || undefined,
        redirectUrl: integration.redirectUrl || undefined,
        billingStatus: integration.billingStatus,
        isActive: integration.isActive,
      },
      data,
    };

    const log = this.webhookLogRepository.create({
      source: INTEGRATION_WEBHOOK_SOURCE,
      event,
      payload: {
        direction: 'outbound',
        url: integration.webhookUrl,
        body,
      } satisfies LoggedWebhookPayload,
      status: 'received',
    });

    const savedLog = await this.webhookLogRepository.save(log);
    await this.sendLoggedWebhook(savedLog);
  }

  async retryWebhookLog(id: string) {
    const log = await this.webhookLogRepository.findOne({ where: { id } });
    if (!log) {
      throw new NotFoundException('Webhook log not found');
    }

    if (log.source !== INTEGRATION_WEBHOOK_SOURCE) {
      throw new BadRequestException(
        'Only outbound integration webhooks can be retried from this flow.',
      );
    }

    log.retryCount += 1;
    log.status = 'received';
    log.error = null as any;
    log.processedAt = null as any;
    const saved = await this.webhookLogRepository.save(log);
    await this.sendLoggedWebhook(saved);

    return {
      message: 'Webhook redelivery attempted',
      id: saved.id,
      retryCount: saved.retryCount,
      status: saved.status,
    };
  }

  private async sendLoggedWebhook(log: WebhookLog) {
    const payload = log.payload as LoggedWebhookPayload;
    if (
      !payload ||
      payload.direction !== 'outbound' ||
      !payload.url ||
      !payload.body
    ) {
      log.status = 'failed';
      log.error = 'Invalid outbound webhook payload';
      log.processedAt = new Date();
      await this.webhookLogRepository.save(log);
      return;
    }

    try {
      const headers = this.buildHeaders(payload.body);
      await axios.post(payload.url, payload.body, {
        headers,
        timeout: this.configService.get<number>(
          'INTEGRATION_WEBHOOK_TIMEOUT_MS',
          10000,
        ),
        validateStatus: () => true,
      }).then(async (response) => {
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Webhook endpoint responded with status ${response.status}`);
        }
      });

      log.status = 'delivered';
      log.error = null as any;
      log.processedAt = new Date();
      await this.webhookLogRepository.save(log);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown webhook delivery error';
      this.logger.warn(
        `Failed to deliver integration webhook ${log.id}: ${message}`,
      );
      log.status = 'failed';
      log.error = message;
      log.processedAt = new Date();
      await this.webhookLogRepository.save(log);
    }
  }

  private buildHeaders(body: DeliveryEnvelope) {
    const jsonBody = JSON.stringify(body);
    const signatureSecret = this.configService.get<string>(
      'INTEGRATION_WEBHOOK_SECRET',
    );
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'MyTrackr-Webhook/1.0',
      'x-mytrackr-event': body.event,
      'x-mytrackr-delivery-id': body.id,
      'x-mytrackr-timestamp': body.createdAt,
    };

    if (signatureSecret) {
      const signature = crypto
        .createHmac('sha256', signatureSecret)
        .update(jsonBody)
        .digest('hex');
      headers['x-mytrackr-signature'] = `sha256=${signature}`;
    }

    return headers;
  }
}
