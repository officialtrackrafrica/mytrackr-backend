import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from '../../common/redis';
import { CategorizationService } from './categorization.service';
import { buildPdfTransactionExternalIds } from './pdf-transaction-external-id.util';
import { StatementAiParserService } from './statement-ai-parser.service';

type PdfAiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type PdfAiJobRecord = {
  id: string;
  status: PdfAiJobStatus;
  businessId: string;
  userId: string;
  fingerprint: string;
  autoCategorize: boolean;
  text: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  result?: {
    imported: number;
    skipped: number;
    errors: string[];
  };
};

export type PdfUploadQueuedResult = {
  jobId: string;
  message: string;
  queued: true;
  status: 'queued' | 'processing';
};

export type PdfUploadJobStatusResult = {
  jobId: string;
  status: PdfAiJobStatus;
  queued: boolean;
  message: string;
  result?: {
    imported: number;
    skipped: number;
    errors: string[];
  };
  error?: string;
};

const JOB_KEY_PREFIX = 'mytrackr:finance:pdf-ai-job:';
const JOB_QUEUE_KEY = 'mytrackr:finance:pdf-ai-jobs:queue';
const AI_INFLIGHT_KEY = 'mytrackr:finance:pdf-ai:inflight';
const FINGERPRINT_KEY_PREFIX = 'mytrackr:finance:pdf-ai:fingerprint:';
const JOB_TTL_SECONDS = 60 * 60 * 24 * 30;
const PDF_PAYLOAD_KEY_PREFIX = 'mytrackr:finance:pdf-ai-payload:';
const PDF_PAYLOAD_TTL_SECONDS = 60 * 60 * 24;

@Injectable()
export class PdfAiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfAiQueueService.name);
  private readonly queueEnabled: boolean;
  private readonly rpmLimit: number;
  private readonly maxConcurrentJobs: number;
  private readonly pollIntervalMs: number;
  private workerTimer: NodeJS.Timeout | null = null;
  private workerActive = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly statementAiParserService: StatementAiParserService,
    private readonly categorizationService: CategorizationService,
  ) {
    this.queueEnabled =
      this.configService.get<string>('STATEMENT_AI_QUEUE_ENABLED') !== 'false';
    this.rpmLimit = this.getPositiveIntConfig('STATEMENT_AI_RPM_LIMIT', 15);
    this.maxConcurrentJobs = this.getPositiveIntConfig(
      'STATEMENT_AI_MAX_CONCURRENT',
      1,
    );
    this.pollIntervalMs = this.getPositiveIntConfig(
      'STATEMENT_AI_QUEUE_POLL_INTERVAL_MS',
      1000,
    );
  }

  onModuleInit() {
    if (!this.queueEnabled) {
      return;
    }

    this.workerTimer = setInterval(() => {
      void this.processNextJob();
    }, this.pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async tryAcquireInlineCapacity(): Promise<boolean> {
    if (!this.queueEnabled) {
      return true;
    }

    const [inflightRaw, rpmRaw] = await Promise.all([
      this.redis.get(AI_INFLIGHT_KEY),
      this.redis.get(this.getRpmWindowKey()),
    ]);

    const inflight = Number.parseInt(inflightRaw || '0', 10);
    const rpmCount = Number.parseInt(rpmRaw || '0', 10);
    if (inflight >= this.maxConcurrentJobs || rpmCount >= this.rpmLimit) {
      return false;
    }

    const windowKey = this.getRpmWindowKey();
    await this.redis
      .multi()
      .incr(AI_INFLIGHT_KEY)
      .incr(windowKey)
      .expire(windowKey, 120)
      .exec();

    return true;
  }

  async releaseInlineCapacity(): Promise<void> {
    if (!this.queueEnabled) {
      return;
    }

    const inflightRaw = await this.redis.get(AI_INFLIGHT_KEY);
    const inflight = Number.parseInt(inflightRaw || '0', 10);
    if (inflight <= 0) {
      return;
    }

    await this.redis.decr(AI_INFLIGHT_KEY);
  }

  async enqueueAiTextJob(payload: {
    text: string;
    pdfBase64?: string;
    businessId: string;
    userId: string;
    fingerprint: string;
    autoCategorize: boolean;
  }): Promise<PdfUploadQueuedResult> {
    const now = new Date().toISOString();
    const job: PdfAiJobRecord = {
      id: uuidv4(),
      status: 'queued',
      businessId: payload.businessId,
      userId: payload.userId,
      fingerprint: payload.fingerprint,
      autoCategorize: payload.autoCategorize,
      text: payload.text,
      createdAt: now,
      updatedAt: now,
    };

    const pipeline = this.redis
      .multi()
      .set(this.getJobKey(job.id), JSON.stringify(job), 'EX', JOB_TTL_SECONDS)
      .set(
        this.getFingerprintKey(job.businessId, job.fingerprint),
        job.id,
        'EX',
        JOB_TTL_SECONDS,
      )
      .rpush(JOB_QUEUE_KEY, job.id);

    if (payload.pdfBase64) {
      pipeline.set(
        this.getPdfPayloadKey(job.id),
        payload.pdfBase64,
        'EX',
        PDF_PAYLOAD_TTL_SECONDS,
      );
    }

    await pipeline.exec();

    return {
      jobId: job.id,
      message:
        'PDF accepted and queued for AI extraction because inline AI capacity is currently busy.',
      queued: true,
      status: 'queued',
    };
  }

  async getJobStatus(
    jobId: string,
    userId: string,
  ): Promise<PdfUploadJobStatusResult | null> {
    const record = await this.readJob(jobId);
    if (!record || record.userId !== userId) {
      return null;
    }

    return {
      jobId: record.id,
      status: record.status,
      queued: record.status === 'queued' || record.status === 'processing',
      message: this.getStatusMessage(record),
      result: record.result,
      error: record.error,
    };
  }

  async getExistingFingerprintStatus(
    businessId: string,
    fingerprint: string,
    userId: string,
  ): Promise<PdfUploadJobStatusResult | null> {
    const jobId = await this.redis.get(this.getFingerprintKey(businessId, fingerprint));
    if (!jobId) {
      return null;
    }

    const record = await this.readJob(jobId);
    if (!record) {
      await this.redis.del(this.getFingerprintKey(businessId, fingerprint));
      return null;
    }

    if (record.userId !== userId) {
      return null;
    }

    if (record.status === 'failed') {
      await this.redis.del(this.getFingerprintKey(businessId, fingerprint));
      return null;
    }

    return {
      jobId: record.id,
      status: record.status,
      queued: record.status === 'queued' || record.status === 'processing',
      message: this.getStatusMessage(record),
      result: record.result,
      error: record.error,
    };
  }

  async recordImmediateCompletion(payload: {
    businessId: string;
    userId: string;
    fingerprint: string;
    result: {
      imported: number;
      skipped: number;
      errors: string[];
    };
  }): Promise<void> {
    const now = new Date().toISOString();
    const existingJobId = await this.redis.get(
      this.getFingerprintKey(payload.businessId, payload.fingerprint),
    );
    const jobId = existingJobId || uuidv4();
    const record: PdfAiJobRecord = {
      id: jobId,
      status: 'completed',
      businessId: payload.businessId,
      userId: payload.userId,
      fingerprint: payload.fingerprint,
      autoCategorize: false,
      text: '',
      createdAt: now,
      updatedAt: now,
      result: payload.result,
    };

    await this.redis
      .multi()
      .set(this.getJobKey(jobId), JSON.stringify(record), 'EX', JOB_TTL_SECONDS)
      .set(
        this.getFingerprintKey(payload.businessId, payload.fingerprint),
        jobId,
        'EX',
        JOB_TTL_SECONDS,
      )
      .exec();
  }

  private async processNextJob(): Promise<void> {
    if (this.workerActive) {
      return;
    }

    this.workerActive = true;
    let capacityAcquired = false;

    try {
      const nextJobId = await this.redis.lindex(JOB_QUEUE_KEY, 0);
      if (!nextJobId) {
        return;
      }

      capacityAcquired = await this.tryAcquireInlineCapacity();
      if (!capacityAcquired) {
        return;
      }

      const jobId = await this.redis.lpop(JOB_QUEUE_KEY);
      if (!jobId) {
        await this.releaseInlineCapacity();
        capacityAcquired = false;
        return;
      }

      const record = await this.readJob(jobId);
      if (!record) {
        await this.releaseInlineCapacity();
        capacityAcquired = false;
        return;
      }

      record.status = 'processing';
      record.updatedAt = new Date().toISOString();
      await this.writeJob(record);

      try {
        const pdfBase64 = await this.redis.get(this.getPdfPayloadKey(record.id));
        let parsedRows =
          await this.statementAiParserService.extractTransactionsFromText(
            record.text,
          );

        if (
          parsedRows.length === 0 &&
          pdfBase64 &&
          this.statementAiParserService.supportsDirectPdfInput()
        ) {
          parsedRows =
            await this.statementAiParserService.extractTransactionsFromPdf(
              Buffer.from(pdfBase64, 'base64'),
            );
        }

        if (parsedRows.length === 0) {
          record.status = 'failed';
          record.error =
            'AI extraction completed but no transactions could be detected.';
          record.updatedAt = new Date().toISOString();
          await this.writeJob(record);
          await this.redis.del(this.getPdfPayloadKey(record.id));
          return;
        }

        const externalIds = buildPdfTransactionExternalIds(
          parsedRows,
          record.businessId,
        );
        const imported = await this.categorizationService.ingestTransactions(
          record.businessId,
          record.userId,
          parsedRows.map((row, index) => ({
            businessId: record.businessId,
            userId: record.userId,
            externalId: externalIds[index],
            date: new Date(row.date),
            name: row.name,
            amount: row.amount,
            direction: row.direction,
            description: row.description,
          })),
          { autoCategorize: record.autoCategorize },
        );

        record.status = 'completed';
        record.result = {
          imported,
          skipped: parsedRows.length - imported,
          errors: [],
        };
        record.updatedAt = new Date().toISOString();
        await this.writeJob(record);
        await this.redis.del(this.getPdfPayloadKey(record.id));
      } catch (error: any) {
        record.status = 'failed';
        record.error = error?.message || String(error);
        record.updatedAt = new Date().toISOString();
        await this.writeJob(record);
        await this.redis.del(this.getPdfPayloadKey(record.id));
        this.logger.warn(
          `Queued PDF AI extraction failed for job ${record.id}: ${record.error}`,
        );
      } finally {
        await this.releaseInlineCapacity();
        capacityAcquired = false;
      }
    } catch (error: any) {
      if (capacityAcquired) {
        await this.releaseInlineCapacity();
      }
      this.logger.warn(`PDF AI queue worker iteration failed: ${error.message}`);
    } finally {
      this.workerActive = false;
    }
  }

  private getRpmWindowKey(): string {
    const now = new Date();
    const bucket = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
    return `mytrackr:finance:pdf-ai:rpm:${bucket}`;
  }

  private getJobKey(jobId: string): string {
    return `${JOB_KEY_PREFIX}${jobId}`;
  }

  private getFingerprintKey(businessId: string, fingerprint: string): string {
    return `${FINGERPRINT_KEY_PREFIX}${businessId}:${fingerprint}`;
  }

  private getPdfPayloadKey(jobId: string): string {
    return `${PDF_PAYLOAD_KEY_PREFIX}${jobId}`;
  }

  private async readJob(jobId: string): Promise<PdfAiJobRecord | null> {
    const raw = await this.redis.get(this.getJobKey(jobId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PdfAiJobRecord;
  }

  private async writeJob(job: PdfAiJobRecord): Promise<void> {
    await this.redis.set(
      this.getJobKey(job.id),
      JSON.stringify(job),
      'EX',
      JOB_TTL_SECONDS,
    );
  }

  private getStatusMessage(record: PdfAiJobRecord): string {
    switch (record.status) {
      case 'queued':
        return 'PDF is queued for AI extraction.';
      case 'processing':
        return 'PDF is currently being processed.';
      case 'completed':
        return 'PDF processing completed.';
      case 'failed':
        return record.error || 'PDF processing failed.';
      default:
        return 'Unknown PDF processing status.';
    }
  }

  private getPositiveIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
