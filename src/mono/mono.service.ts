import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiateAccountDto,
  ReauthAccountDto,
} from './dto/initiate-account.dto';
import { CreditworthinessDto } from './dto/creditworthiness.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, Between } from 'typeorm';
import { MonoAccount } from './entities/mono-account.entity';
import { Transaction } from './entities/transaction.entity';
import { User } from '../auth/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MonoService {
  private readonly logger = new Logger(MonoService.name);
  private readonly baseUrl = 'https://api.withmono.com/v2';

  constructor(
    private configService: ConfigService,
    @InjectRepository(MonoAccount)
    private monoAccountRepository: Repository<MonoAccount>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  private getSecretKey(): string {
    const key = this.configService.get<string>('MONO_SECRET_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'MONO_SECRET_KEY is not configured',
      );
    }
    return key;
  }

  private defaultHeaders(
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'mono-sec-key': this.getSecretKey(),
      ...extraHeaders,
    };
  }

  private async monoGet<T = any>(
    path: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.defaultHeaders(extraHeaders),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`Mono GET ${path} failed: ${JSON.stringify(data)}`);
        throw new Error(data.message || `GET ${path} failed`);
      }

      return data as T;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Mono API request failed',
      );
    }
  }

  private async monoPost<T = any>(
    path: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    try {
      const headers = this.defaultHeaders(extraHeaders);
      this.logger.debug(`Mono POST Request to ${this.baseUrl}${path}`);
      this.logger.debug(`Mono POST Headers: ${JSON.stringify(headers)}`);
      this.logger.debug(`Mono POST Body: ${JSON.stringify(body)}`);

      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`Mono POST ${path} failed: ${JSON.stringify(data)}`);
        throw new Error(data.message || `POST ${path} failed`);
      }

      return data as T;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Mono API request failed',
      );
    }
  }

  async initiateAccountLinking(user: User, dto: InitiateAccountDto) {
    const payload: any = {
      customer: {
        name: user.firstName
          ? `${user.firstName} ${user.lastName || ''}`.trim()
          : user.email?.split('@')[0] || 'User',
        email: user.email,
      },
      ...dto,
    };

    if (!payload.scope) {
      payload.scope = 'auth';
    }

    payload.meta = {
      ref: `acc_link_${uuidv4()}|${user.id}`,
    };
    console.log(payload);
    this.logger.debug(
      `Sending payload to Mono: ${JSON.stringify(payload, null, 2)}`,
    );
    return this.monoPost('/accounts/initiate', payload);
  }

  async reauthenticateAccount(userId: string, dto: ReauthAccountDto) {
    const payload: any = {
      account: dto.accountId,
      scope: 'reauth',
      ...dto,
    };

    if (!payload.account || payload.account === 'string') {
      delete payload.account;
    }

    payload.meta = {
      ref: `acc_link_${uuidv4()}|${userId}`,
    };

    this.logger.debug(
      `Sending payload to Mono: ${JSON.stringify(payload, null, 2)}`,
    );
    return this.monoPost('/accounts/initiate', payload);
  }

  async getUserLinkedAccounts(userId: string) {
    return this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });
  }

  async getAllPlatformAccounts() {
    return this.monoGet('/accounts');
  }

  async getAllUserStatements(
    userId: string,
    months?: number,
    realtime?: boolean,
  ) {
    const userAccounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });

    if (!userAccounts.length) {
      return { message: 'No linked accounts found for this user', data: [] };
    }

    const statementsData = await Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const statement = await this.getStatements(
            acc.monoAccountId,
            months,
            realtime,
          );
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            accountNumber: acc.accountNumber,
            data: statement,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            accountNumber: acc.accountNumber,
            error: error.message,
          };
        }
      }),
    );

    return {
      totalAccounts: userAccounts.length,
      statements: statementsData,
    };
  }

  async getStatements(accountId: string, months?: number, realtime?: boolean) {
    let url = `/accounts/${accountId}/statement`;
    if (months) {
      url += `?months=${months}`;
    }
    const headers = realtime ? { 'x-realtime': 'true' } : undefined;
    return this.monoGet(url, headers);
  }

  async getAllUserTransactions(
    userId: string,
    start?: string,
    end?: string,
    forceSync?: boolean,
  ) {
    const now = new Date();

    const parsedStart = start ? this.parseDateParam(start) : undefined;
    const parsedEnd = end ? this.parseDateParam(end) : undefined;

    if (parsedStart && isNaN(parsedStart.getTime())) {
      throw new BadRequestException(`Invalid start date: ${start}`);
    }
    if (parsedEnd && isNaN(parsedEnd.getTime())) {
      throw new BadRequestException(`Invalid end date: ${end}`);
    }
    if (parsedStart && parsedStart > now) {
      throw new BadRequestException('Start date cannot be in the future');
    }
    // Clamp end date to today if it's in the future
    const effectiveEnd =
      parsedEnd && parsedEnd > now ? this.formatDateForMono(now) : end;

    if (parsedStart && parsedEnd && parsedStart > parsedEnd) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    const userAccounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });

    if (!userAccounts.length) {
      return { message: 'No linked accounts found for this user', data: [] };
    }

    // Delta sync all accounts
    await Promise.all(
      userAccounts.map((acc) =>
        this.syncTransactionsForAccount(acc, parsedStart, forceSync).catch(
          (e) =>
            this.logger.error(
              `Sync failed for account ${acc.monoAccountId}: ${e.message}`,
            ),
        ),
      ),
    );

    // Serve from DB
    return this.getTransactionsFromDb(userId, start, effectiveEnd);
  }

  async syncTransactionsForAccount(
    account: MonoAccount,
    requestedStart?: Date,
    forceSync?: boolean,
  ) {
    const now = new Date();

    let forwardStart: Date;
    if (!account.lastSyncedAt || forceSync) {
      forwardStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    } else {
      forwardStart = new Date(account.lastSyncedAt);
    }

    if (forwardStart < now) {
      this.logger.log(
        `Forward sync for ${account.monoAccountId}: ${forwardStart.toISOString()} → ${now.toISOString()}`,
      );
      await this.fetchAndStoreTransactions(account, forwardStart, now);
    }

    if (
      requestedStart &&
      (!account.earliestSyncedAt || requestedStart < account.earliestSyncedAt)
    ) {
      const backfillEnd = account.earliestSyncedAt || forwardStart;
      this.logger.log(
        `Backfill sync for ${account.monoAccountId}: ${requestedStart.toISOString()} → ${backfillEnd.toISOString()}`,
      );
      await this.fetchAndStoreTransactions(
        account,
        requestedStart,
        backfillEnd,
      );
    }

    const newEarliest = requestedStart
      ? account.earliestSyncedAt
        ? new Date(
            Math.min(
              requestedStart.getTime(),
              account.earliestSyncedAt.getTime(),
            ),
          )
        : requestedStart
      : account.earliestSyncedAt || forwardStart;

    await this.monoAccountRepository.update(
      { id: account.id },
      {
        lastSyncedAt: now,
        earliestSyncedAt: newEarliest,
      },
    );

    this.logger.log(
      `Sync boundaries updated for ${account.monoAccountId}: earliest=${newEarliest.toISOString()}, latest=${now.toISOString()}`,
    );
  }

  private async fetchAndStoreTransactions(
    account: MonoAccount,
    startDate: Date,
    endDate: Date,
  ) {
    const start = this.formatDateForMono(startDate);
    const end = this.formatDateForMono(endDate);

    let page = 1;
    let hasMore = true;
    let totalInserted = 0;

    while (hasMore) {
      const params = new URLSearchParams();
      params.append('start', start);
      params.append('end', end);
      params.append('page', String(page));

      const url = `/accounts/${account.monoAccountId}/transactions?${params.toString()}`;

      try {
        const response = await this.monoGet<any>(url);
        const transactions = response?.data || [];

        if (transactions.length > 0) {
          await this.upsertTransactions(account, transactions);
          totalInserted += transactions.length;
        }

        // Check for next page
        hasMore = !!response?.meta?.next;
        page++;
      } catch (error) {
        this.logger.error(
          `Error fetching transactions page ${page} for ${account.monoAccountId}: ${error.message}`,
        );
        hasMore = false;
      }
    }

    this.logger.log(
      `Stored ${totalInserted} transactions for account ${account.monoAccountId} (${start} → ${end})`,
    );
  }

  private async upsertTransactions(
    account: MonoAccount,
    monoTransactions: any[],
  ) {
    const entities = monoTransactions.map((tx) =>
      this.transactionRepository.create({
        monoTransactionId: tx.id,
        monoAccount: { id: account.id } as any,
        narration: tx.narration || '',
        amount: tx.amount,
        type: tx.type,
        category: tx.category || null,
        currency: tx.currency || 'NGN',
        balance: tx.balance,
        date: new Date(tx.date),
        metadata: tx.enrichment || tx.metadata || null,
      }),
    );

    // Use ON CONFLICT to update Mono-sourced fields but preserve manual overrides
    await this.transactionRepository
      .createQueryBuilder()
      .insert()
      .into(Transaction)
      .values(entities)
      .orUpdate(
        [
          'narration',
          'amount',
          'type',
          'category',
          'currency',
          'balance',
          'date',
          'metadata',
        ],
        ['monoTransactionId', 'monoAccountId'],
      )
      .execute();
  }

  async getTransactionsFromDb(userId: string, start?: string, end?: string) {
    const userAccounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });

    if (!userAccounts.length) {
      return { message: 'No linked accounts found for this user', data: [] };
    }

    const transactionsData = await Promise.all(
      userAccounts.map(async (acc) => {
        const where: any = { monoAccount: { id: acc.id } };

        // Apply date filters
        if (start && end) {
          where.date = Between(
            this.parseDateParam(start),
            this.parseDateParam(end),
          );
        } else if (start) {
          where.date = MoreThanOrEqual(this.parseDateParam(start));
        } else if (end) {
          where.date = LessThanOrEqual(this.parseDateParam(end));
        }

        const transactions = await this.transactionRepository.find({
          where,
          order: { date: 'DESC' },
        });

        return {
          bankName: acc.institutionName,
          monoAccountId: acc.monoAccountId,
          accountNumber: acc.accountNumber,
          syncedRange: {
            earliest: acc.earliestSyncedAt,
            latest: acc.lastSyncedAt,
          },
          total: transactions.length,
          data: transactions,
        };
      }),
    );

    return {
      totalAccounts: userAccounts.length,
      transactions: transactionsData,
    };
  }

  private parseDateParam(dateStr: string): Date {
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const [dd, mm, yyyy] = dateStr.split('-');
      return new Date(Date.UTC(+yyyy, +mm - 1, +dd));
    }
    return new Date(dateStr);
  }

  private formatDateForMono(date: Date): string {
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  private async getTransactionsFromMono(
    accountId: string,
    start?: string,
    end?: string,
  ) {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    const queryString = params.toString();
    const url = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;
    return this.monoGet(url);
  }

  async categoriseAllUserTransactions(userId: string) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.categoriseTransactions(acc.monoAccountId);
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            error: error.message,
          };
        }
      }),
    );
  }

  async categoriseTransactions(accountId: string) {
    return this.monoPost(
      `/accounts/${accountId}/transactions/categorise`,
      null,
    );
  }

  async enrichTransactionMetadata(accountId: string) {
    return this.monoPost(`/accounts/${accountId}/transactions/metadata`, null);
  }

  // ─── Manual Category Override ───────────────────────────────────────

  async updateTransactionCategory(
    userId: string,
    transactionId: string,
    newCategory: string,
  ) {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['monoAccount', 'monoAccount.user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.monoAccount?.user?.id !== userId) {
      throw new UnauthorizedException(
        'You can only modify your own transactions',
      );
    }

    transaction.manualCategory = newCategory;
    transaction.categorySource = 'manual';
    await this.transactionRepository.save(transaction);

    return {
      id: transaction.id,
      category: transaction.manualCategory,
      originalCategory: transaction.category,
      categorySource: transaction.categorySource,
    };
  }

  async resetTransactionCategory(userId: string, transactionId: string) {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['monoAccount', 'monoAccount.user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.monoAccount?.user?.id !== userId) {
      throw new UnauthorizedException(
        'You can only modify your own transactions',
      );
    }

    transaction.manualCategory = null;
    transaction.categorySource = 'mono';
    await this.transactionRepository.save(transaction);

    return {
      id: transaction.id,
      category: transaction.category,
      categorySource: transaction.categorySource,
    };
  }

  // ─── Job Tracking ──────────────────────────────────────────────────

  async getEnrichmentJobStatus(jobId: string) {
    return this.monoGet(`/accounts/jobs/${jobId}`);
  }

  async getEnrichmentRecords(jobId: string) {
    return this.monoGet(`/enrichments/record/${jobId}`);
  }

  async getAllUserCredits(userId: string) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.getCredits(acc.monoAccountId);
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            error: error.message,
          };
        }
      }),
    );
  }

  async getCredits(accountId: string) {
    return this.monoGet(`/accounts/${accountId}/credits`);
  }

  async getAllUserDebits(userId: string) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.getDebits(acc.monoAccountId);
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            error: error.message,
          };
        }
      }),
    );
  }

  async getDebits(accountId: string) {
    return this.monoGet(`/accounts/${accountId}/debits`);
  }

  async getAllUserIncome(userId: string) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.getIncome(acc.monoAccountId);
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            error: error.message,
          };
        }
      }),
    );
  }

  async getIncome(accountId: string) {
    return this.monoGet(`/accounts/${accountId}/income`);
  }

  async getAllUserCreditworthiness(userId: string, dto: CreditworthinessDto) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.getCreditworthiness(acc.monoAccountId, dto);
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            monoAccountId: acc.monoAccountId,
            error: error.message,
          };
        }
      }),
    );
  }

  async getCreditworthiness(accountId: string, dto: CreditworthinessDto) {
    return this.monoPost(`/accounts/${accountId}/creditworthiness`, dto);
  }

  verifyWebhookSecret(headerSecret: string): boolean {
    const secret = this.configService.get<string>('MONO_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn(
        'MONO_WEBHOOK_SECRET is not configured — rejecting webhook',
      );
      throw new UnauthorizedException('Webhook secret is not configured');
    }
    if (headerSecret !== secret) {
      this.logger.warn('Webhook secret mismatch — rejecting request');
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return true;
  }

  async handleWebhookEvent(payload: { event: string; data: any }) {
    const { event, data } = payload;

    this.logger.log(`Received Mono webhook event: ${event}`);
    this.logger.debug(`Webhook payload: ${JSON.stringify(data)}`);

    switch (event) {
      case 'mono.events.account_connected':
        this.logger.log(
          `Account connected — mono account id: ${data?.id}, customer: ${data?.customer}`,
        );
        await this.handleAccountConnected(data).catch((e) =>
          this.logger.error(e),
        );
        break;

      case 'mono.events.account_updated':
        this.logger.log(
          `Account updated — data status: ${data?.meta?.data_status}`,
        );
        await this.handleAccountUpdated(data).catch((e) =>
          this.logger.error(e),
        );
        break;

      case 'mono.events.transaction_categorisation':
        this.logger.log(
          `Transaction categorisation completed for account: ${data?.account}`,
        );
        await this.handleTransactionCategorisation(data).catch((e) =>
          this.logger.error(
            `Categorisation webhook handling failed: ${e.message}`,
          ),
        );
        break;

      case 'mono.events.transaction_metadata':
        this.logger.log(
          `Transaction metadata enrichment completed for account: ${data?.account}`,
        );
        await this.handleTransactionMetadata(data).catch((e) =>
          this.logger.error(`Metadata webhook handling failed: ${e.message}`),
        );
        break;

      case 'mono.events.account_credit_worthiness':
        this.logger.log(
          `Creditworthiness data received — can afford: ${data?.summary?.can_afford}`,
        );
        // TODO: Persist creditworthiness results
        break;

      default:
        this.logger.log(`Unhandled Mono event: ${event}`);
        break;
    }

    return { received: true };
  }
  private async handleAccountConnected(data: any) {
    const metaRef = data?.meta?.ref || '';
    const userId = metaRef.includes('|') ? metaRef.split('|')[1] : null;
    const monoAccountId = data?.id;

    if (!monoAccountId) return;

    try {
      let account = await this.monoAccountRepository.findOne({
        where: { monoAccountId },
        relations: ['user'],
      });

      if (!account) {
        account = this.monoAccountRepository.create({
          monoAccountId,
          user: userId ? ({ id: userId } as any) : null,
          dataStatus: 'CONNECTED',
        });
        await this.monoAccountRepository.save(account);
        this.logger.log(`Saved new MonoAccount: ${monoAccountId}`);
      } else {
        // Prevent stealing link if already linked to another user
        if (account.user && account.user.id !== userId) {
          this.logger.warn(
            `Security Warning: User ${userId} attempted to link an account already linked to ${account.user.id}`,
          );
          return;
        }

        this.logger.log(
          `Account ${monoAccountId} already linked. Updating user reference.`,
        );
        if (userId) {
          account.user = { id: userId } as any;
          await this.monoAccountRepository.save(account);
        }
      }
    } catch (error) {
      this.logger.error(`Error saving connected account: ${error.message}`);
    }
  }

  private async handleAccountUpdated(data: any) {
    const monoAccountId = data?.account?._id || data?.id;
    if (!monoAccountId) return;

    try {
      await this.monoAccountRepository.update(
        { monoAccountId },
        {
          dataStatus: data?.meta?.data_status,
          name: data?.account?.name,
          accountNumber: data?.account?.accountNumber,
          currency: data?.account?.currency,
          balance: data?.account?.balance,
          type: data?.account?.type,
          bvn: data?.account?.bvn,
          institutionName: data?.account?.institution?.name,
          institutionBankCode: data?.account?.institution?.bankCode,
        },
      );
      this.logger.log(`Updated MonoAccount: ${monoAccountId}`);

      // Trigger initial transaction sync (Jan 1 → today)
      const account = await this.monoAccountRepository.findOne({
        where: { monoAccountId },
      });
      if (account && !account.lastSyncedAt) {
        this.logger.log(
          `Triggering initial transaction sync for ${monoAccountId}`,
        );

        // Sync transactions, then auto-trigger categorisation + metadata enrichment
        this.syncTransactionsForAccount(account)
          .then(async () => {
            this.logger.log(
              `Initial sync complete for ${monoAccountId}. Triggering enrichment...`,
            );
            await Promise.allSettled([
              this.categoriseTransactions(monoAccountId),
              this.enrichTransactionMetadata(monoAccountId),
            ]);
            await this.monoAccountRepository.update(
              { id: account.id },
              { lastCategorisedAt: new Date() },
            );
            this.logger.log(`Enrichment triggered for ${monoAccountId}`);
          })
          .catch((e) =>
            this.logger.error(
              `Initial sync/enrichment failed for ${monoAccountId}: ${e.message}`,
            ),
          );
      }
    } catch (error) {
      this.logger.error(`Error updating account data: ${error.message}`);
    }
  }

  /**
   * Handles the transaction_categorisation webhook.
   * Re-syncs transactions for the affected account to pull updated categories.
   */
  private async handleTransactionCategorisation(data: any) {
    const monoAccountId = data?.account || data?.id;
    if (!monoAccountId) {
      this.logger.warn(
        'Transaction categorisation webhook received without account ID',
      );
      return;
    }

    const account = await this.monoAccountRepository.findOne({
      where: { monoAccountId },
    });

    if (!account) {
      this.logger.warn(
        `Received categorisation webhook for unknown account: ${monoAccountId}`,
      );
      return;
    }

    this.logger.log(
      `Re-syncing transactions after categorisation for ${monoAccountId}`,
    );

    // Force a full re-sync to pull updated categories
    await this.syncTransactionsForAccount(account, undefined, true);

    // Update the categorisation timestamp
    await this.monoAccountRepository.update(
      { id: account.id },
      { lastCategorisedAt: new Date() },
    );

    this.logger.log(`Transaction categories updated for ${monoAccountId}`);
  }

  /**
   * Handles the transaction_metadata webhook.
   * Re-syncs transactions for the affected account to pull updated metadata.
   */
  private async handleTransactionMetadata(data: any) {
    const monoAccountId = data?.account || data?.id;
    if (!monoAccountId) {
      this.logger.warn(
        'Transaction metadata webhook received without account ID',
      );
      return;
    }

    const account = await this.monoAccountRepository.findOne({
      where: { monoAccountId },
    });

    if (!account) {
      this.logger.warn(
        `Received metadata webhook for unknown account: ${monoAccountId}`,
      );
      return;
    }

    this.logger.log(
      `Re-syncing transactions after metadata enrichment for ${monoAccountId}`,
    );

    // Force a full re-sync to pull updated metadata
    await this.syncTransactionsForAccount(account, undefined, true);

    this.logger.log(`Transaction metadata updated for ${monoAccountId}`);
  }
}
