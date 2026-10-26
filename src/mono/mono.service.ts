import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  InitiateAccountDto,
  ReauthAccountDto,
  UpdateTransactionCategoryDto,
  CreditworthinessDto,
} from './dto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  LessThanOrEqual,
  MoreThanOrEqual,
  Between,
  In,
} from 'typeorm';
import { MonoAccount } from './entities/mono-account.entity';
import { MonoTransaction } from './entities/transaction.entity';
import { User } from '../auth/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import { AiCategorizationService } from '../categorization/categorization.service';
import { TransactionSyncService } from './services/transaction-sync.service';
import { BusinessService } from '../business/services/business.service';
import { AccountCategory } from '../finance/entities/account-category.entity';
import { AccountSubCategory } from '../finance/entities/account-subcategory.entity';
import {
  CategorySource,
  Transaction as FinanceTransaction,
} from '../finance/entities/transaction.entity';
import { SubscriptionService } from '../payments/services/subscription.service';

export class TransactionSyncProcessing extends Error {
  constructor() {
    super('Bank transaction refresh is processing. Showing saved transactions.');
  }
}

export interface TransactionSyncStatus {
  status: 'completed' | 'processing';
  message?: string;
}

@Injectable()
export class MonoService {
  private readonly monoResponseCapture = new AsyncLocalStorage<Array<{
    url: string;
    status: number;
    headers: Record<string, string>;
    body: string;
  }>>();

  async withMonoResponses<T>(operation: () => Promise<T>) {
    return this.monoResponseCapture.run([], async () => {
      const data = await operation();
      return { ...data, monoResponses: this.monoResponseCapture.getStore()! };
    });
  }

  private readonly logger = new Logger(MonoService.name);
  private readonly baseUrl = 'https://api.withmono.com/v2';
  private readonly maxRetries = 3;
  private readonly initialRetryDelayMs = 60 * 1000; // 1 minute
  private monoAccountFkColumnName: string | null = null;
  private readonly financeSyncs = new Map<string, Promise<TransactionSyncStatus>>();

  constructor(
    private configService: ConfigService,
    @InjectRepository(MonoAccount)
    private monoAccountRepository: Repository<MonoAccount>,
    @InjectRepository(MonoTransaction)
    private transactionRepository: Repository<MonoTransaction>,
    @InjectRepository(FinanceTransaction)
    private financeTransactionRepository: Repository<FinanceTransaction>,
    @InjectRepository(AccountCategory)
    private categoryRepo: Repository<AccountCategory>,
    @InjectRepository(AccountSubCategory)
    private subCategoryRepo: Repository<AccountSubCategory>,
    private readonly aiCategorizationService: AiCategorizationService,
    private readonly transactionSyncService: TransactionSyncService,
    private readonly businessService: BusinessService,
    private readonly subscriptionService: SubscriptionService,
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
        ...(path.includes('/jobs/') ? { signal: AbortSignal.timeout(15_000) } : {}),
      });

      const capture = this.monoResponseCapture?.getStore();
      let data: any;
      if (capture) {
        const body = await response.text();
        capture.push({
          url: `${this.baseUrl}${path}`,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        });
        data = JSON.parse(body);
      } else {
        data = await response.json();
      }

      if (extraHeaders?.['x-realtime'] === 'true') {
        const jobStatus = response.headers.get('x-job-status')?.toLowerCase();
        const jobId = response.headers.get('x-job-id');
        const transactionAccount = path.match(/^\/accounts\/([^/]+)\/transactions(?:\?|$)/)?.[1];
        if (transactionAccount) {
          // Persist before throwing processing/failed so another request or server
          // instance can inspect the exact job after a page reload.
          await this.monoAccountRepository.update(
            { monoAccountId: transactionAccount },
            {
              syncJobId: jobId || null,
              syncJobStatus: jobStatus || null,
              syncJobCheckedAt: new Date(),
            },
          );
        }
        if (jobStatus === 'processing') throw new TransactionSyncProcessing();
        if (jobStatus === 'failed') {
          throw new ServiceUnavailableException(
            'Bank transaction refresh failed. The linked account may require reauthorization. Use POST /mono/reauth with the Mono accountId to reconnect, then retry.',
          );
        }
      }

      if (!response.ok) {
        this.logger.error(`Mono GET ${path} failed: ${JSON.stringify(data)}`);
        throw new Error(data.message || `GET ${path} failed`);
      }

      return data as T;
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof TransactionSyncProcessing ||
        error instanceof ServiceUnavailableException
      ) throw error;
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

  /**
   * Exponential backoff retry for Mono async operations (like categorisation, metadata)
   */
  private retryMonoAction(
    actionName: string,
    actionFn: () => Promise<any>,
    retryCount = 0,
  ): void {
    if (retryCount >= this.maxRetries) {
      this.logger.error(
        `[${actionName}] Reached max retries (${this.maxRetries}). Action permanently failed.`,
      );
      // In a more complex system, we might update account status to 'FAILED' here.
      return;
    }

    const delay = this.initialRetryDelayMs * Math.pow(2, retryCount); // 1m, 2m, 4m
    this.logger.log(
      `[${actionName}] Scheduling retry ${retryCount + 1}/${this.maxRetries} in ${delay}ms`,
    );

    setTimeout(() => {
      void (async () => {
        try {
          this.logger.log(
            `[${actionName}] Executing retry ${retryCount + 1}...`,
          );
          await actionFn();
        } catch (error) {
          this.logger.warn(
            `[${actionName}] Retry ${retryCount + 1} failed: ${error.message}`,
          );
          // Recurse for the next retry
          this.retryMonoAction(actionName, actionFn, retryCount + 1);
        }
      })();
    }, delay);
  }

  async initiateAccountLinking(user: User, dto: InitiateAccountDto) {
    await this.subscriptionService.assertCanLinkAnotherBankAccount(user.id);

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
    const accounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });

    return accounts.map((account) => this.toMonoAccountResponse(account));
  }

  async getAllPlatformAccounts() {
    return this.monoGet('/accounts');
  }

  async getAdminUserSyncStatus(userId: string, checkLiveJobs = true) {
    const accounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });
    if (!accounts.length) throw new NotFoundException('No linked Mono accounts found for this user');
    return {
      userId,
      checkedAt: new Date(),
      accounts: await Promise.all(accounts.map(async (account) => {
        let jobStatus = account.syncJobStatus || null;
        let jobCheckedAt = account.syncJobCheckedAt || null;
        let jobCheckError: string | null = null;
        if (checkLiveJobs && account.syncJobId) {
          try {
            const response = await this.monoGet<any>(
              `/accounts/${encodeURIComponent(account.monoAccountId)}/jobs/${encodeURIComponent(account.syncJobId)}`,
            );
            const status = String(response?.data?.status || '').toLowerCase();
            if (!['processing', 'finished', 'failed'].includes(status)) {
              throw new Error('Invalid Mono job status');
            }
            jobStatus = status;
            jobCheckedAt = new Date();
            await this.monoAccountRepository.update(
              { id: account.id, syncJobId: account.syncJobId },
              { syncJobStatus: status, syncJobCheckedAt: jobCheckedAt },
            );
          } catch (error) {
            jobCheckError = 'Unable to confirm current status with Mono. The displayed status is the last known result; retry the check.';
            this.logger.error(`Mono job check failed for ${account.monoAccountId}: ${error.message}`);
          }
        }
        const where = { monoAccount: { id: account.id } };
        const [transactionCount, latest] = await Promise.all([
          this.transactionRepository.count({ where }),
          this.transactionRepository.findOne({ where, order: { date: 'DESC' } }),
        ]);
        return {
          accountId: account.monoAccountId,
          institutionName: account.institutionName,
          dataStatus: account.dataStatus,
          lastSyncedAt: account.lastSyncedAt || null,
          transactionCount,
          latestTransactionDate: latest?.date || null,
          jobId: account.syncJobId || null,
          jobStatus,
          jobCheckedAt,
          jobCheckError,
          webhooks: account.syncWebhooks || [],
        };
      })),
    };
  }

  async testAdminUserSync(userId: string) {
    const before = await this.getAdminUserSyncStatus(userId, false);
    const accounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });
    const results: Array<{
      accountId: string;
      status: 'completed' | 'processing' | 'failed';
      projection?: Awaited<ReturnType<TransactionSyncService['syncAccountTransactions']>>;
      message?: string;
    }> = [];
    // Report each account independently so one bank failure does not hide others.
    for (const account of accounts) {
      try {
        // Bypass the local freshness cache, retaining the incremental boundary.
        await this.syncTransactionsForAccount(account, undefined, false, false, false, true);
        const projection = await this.transactionSyncService.syncAccountTransactions(account.monoAccountId);
        results.push({ accountId: account.monoAccountId, status: 'completed', projection });
      } catch (error) {
        const processing = error instanceof TransactionSyncProcessing;
        results.push({
          accountId: account.monoAccountId,
          status: processing ? 'processing' : 'failed',
          message: processing ? error.message : 'Bank refresh or finance import failed. Check server logs; the account may require reauthorization.',
        });
        if (!processing) this.logger.error(`Admin sync test failed for ${account.monoAccountId}: ${error.message}`);
      }
    }
    return {
      userId,
      before,
      after: await this.getAdminUserSyncStatus(userId, false),
      results,
    };
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
    autoCategorize = false,
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

    const syncResults = await Promise.all(
      userAccounts.map((acc) =>
        this.syncTransactionsForAccount(
          acc,
          parsedStart,
          forceSync,
          autoCategorize,
        )
          .then(() =>
            this.transactionSyncService.syncAccountTransactions(
              acc.monoAccountId,
              { autoCategorize },
            ),
          )
          .catch((e) => {
            if (e instanceof TransactionSyncProcessing) return e;
            this.logger.error(
              `Sync failed for account ${acc.monoAccountId}: ${e.message}`,
            );
            throw e;
          }),
      ),
    );

    const processing = syncResults.some((result) => result instanceof TransactionSyncProcessing);
    return {
      ...(await this.getTransactionsFromDb(userId, start, effectiveEnd)),
      sync: this.getSyncStatus(processing),
    };
  }

  // Date filters affect the response, never the forward sync boundary.
  async syncUserTransactionsForFinance(userId: string, startDate?: string): Promise<TransactionSyncStatus> {
    const previous = this.financeSyncs.get(userId) || Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      const requestedStart = startDate ? new Date(startDate) : undefined;
      if (requestedStart && (isNaN(requestedStart.getTime()) || requestedStart > new Date())) {
        throw new BadRequestException('Invalid transaction sync start date');
      }
      const accounts = await this.monoAccountRepository.find({
        where: { user: { id: userId } },
      });
      const results = await Promise.all(accounts.map(async (account) => {
        try {
          await this.syncTransactionsForAccount(account, requestedStart, false, false, true);
        } catch (error) {
          if (error instanceof TransactionSyncProcessing) return error;
          throw error;
        }
        // Retry projection even when Mono is fresh, in case an earlier projection failed.
        await this.transactionSyncService.syncAccountTransactions(account.monoAccountId);
      }));
      return this.getSyncStatus(results.some((result) => result instanceof TransactionSyncProcessing));
    });
    this.financeSyncs.set(userId, pending);
    try {
      return await pending;
    } finally {
      if (this.financeSyncs.get(userId) === pending) this.financeSyncs.delete(userId);
    }
  }

  private getSyncStatus(processing: boolean): TransactionSyncStatus {
    return processing
      ? { status: 'processing', message: new TransactionSyncProcessing().message }
      : { status: 'completed' };
  }

  async syncTransactionsForAccount(
    account: MonoAccount,
    requestedStart?: Date,
    forceSync?: boolean,
    autoCategorize = false,
    reuseRecent = false,
    realtime = true,
  ) {
    const now = new Date();
    // Mono permits a new realtime session every five minutes. A same-day
    // cache hides transactions posted after the first successful daily import.
    const syncAge = account.lastSyncedAt
      ? now.getTime() - new Date(account.lastSyncedAt).getTime()
      : Infinity;
    const forwardIsFresh = reuseRecent && !forceSync &&
      syncAge >= 0 && syncAge < 5 * 60 * 1000;
    const needsBackfill = requestedStart &&
      (!account.earliestSyncedAt || requestedStart < account.earliestSyncedAt);
    if (forwardIsFresh && !needsBackfill) return;

    let forwardStart: Date;
    if (!account.lastSyncedAt || forceSync) {
      forwardStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    } else {
      forwardStart = new Date(account.lastSyncedAt);
    }

    if (!forwardIsFresh && forwardStart < now) {
      this.logger.log(
        `Forward sync for ${account.monoAccountId}: ${forwardStart.toISOString()} → ${now.toISOString()}`,
      );
      await this.fetchAndStoreTransactions(
        account,
        forwardStart,
        now,
        autoCategorize,
        realtime,
      );
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
        autoCategorize,
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
        lastSyncedAt: forwardIsFresh ? account.lastSyncedAt : now,
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
    autoCategorize = false,
    realtime = false,
  ) {
    const details = await this.monoGet<any>(`/accounts/${account.monoAccountId}`);
    const meta = details?.data?.meta;
    if (String(meta?.data_status).toUpperCase() === 'PROCESSING') {
      throw new TransactionSyncProcessing();
    }
    // A realtime request can recover UNAVAILABLE/PARTIAL data. Only cached
    // imports require transactions to already be available at Mono.
    if (!realtime && !this.hasTransactionData(meta)) {
      throw new ServiceUnavailableException(
        `Bank transactions are not available yet (status: ${meta?.data_status || 'unknown'}). Please try again shortly.`,
      );
    }
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
      params.append('paginate', 'true');

      const url = `/accounts/${account.monoAccountId}/transactions?${params.toString()}`;

      try {
        // Only the first page starts a bank refresh. Further pages read its results.
        const response = await this.monoGet<any>(url, {
          'x-realtime': String(realtime && page === 1),
        });
        if (response?.status === 'failed' || !Array.isArray(response?.data)) {
          throw new ServiceUnavailableException(
            'Mono returned an invalid transaction response',
          );
        }
        const transactions = response.data;

        if (transactions.length > 0) {
          await this.upsertTransactions(account, transactions, autoCategorize);
          totalInserted += transactions.length;
        }

        hasMore = !!response?.meta?.next;
        page++;
      } catch (error) {
        if (error instanceof TransactionSyncProcessing) throw error;
        this.logger.error(
          `Error fetching transactions page ${page} for ${account.monoAccountId}: ${error.message}`,
        );
        throw error;
      }
    }

    this.logger.log(
      `Stored ${totalInserted} transactions for account ${account.monoAccountId} (${start} → ${end})`,
    );
  }

  private async upsertTransactions(
    account: MonoAccount,
    monoTransactions: any[],
    autoCategorize = false,
  ) {
    const validTransactions = monoTransactions.filter((tx) => {
      if (tx?.id || tx?._id) {
        return true;
      }

      this.logger.warn(
        `Skipping Mono transaction without id for account ${account.monoAccountId}`,
      );
      return false;
    });

    const monoTransactionIds = validTransactions.map((tx) => tx.id || tx._id);
    const existingTransactions = monoTransactionIds.length
      ? await this.transactionRepository.find({
          where: {
            monoAccountId: account.id,
            monoTransactionId: In(monoTransactionIds),
          },
          withDeleted: true,
        })
      : [];

    const suppressedTransactionIds = new Set(
      existingTransactions
        .filter((transaction) => !!transaction.deletedAt)
        .map((transaction) => transaction.monoTransactionId),
    );

    if (suppressedTransactionIds.size > 0) {
      this.logger.log(
        `Skipping ${suppressedTransactionIds.size} user-deleted Mono transactions for account ${account.monoAccountId}`,
      );
    }

    const importableTransactions = validTransactions.filter((tx) => {
      const monoTransactionId = tx.id || tx._id;
      return !suppressedTransactionIds.has(monoTransactionId);
    });

    if (importableTransactions.length === 0) {
      return;
    }

    const entities = await Promise.all(
      importableTransactions.map(async (tx) => {
        let finalCategory: string | null = null;
        let finalCategoryId: string | null = null;
        let finalSubCategory: string | null = autoCategorize
          ? tx.sub_category || null
          : null;
        let finalSubCategoryId: string | null = null;
        let finalAiCategory: string | null = null;
        let finalCategorySource = CategorySource.MONO;
        const monoTransactionId = tx.id || tx._id;

        if (autoCategorize) {
          const predicted = await this.aiCategorizationService.predict(
            tx.narration || '',
            account.user?.id || '',
          );
          finalCategory =
            predicted.category !== 'Uncategorized'
              ? predicted.category
              : tx.category || null;
          finalCategorySource =
            predicted.category !== 'Uncategorized'
              ? CategorySource.AI
              : CategorySource.MONO;
          finalAiCategory =
            predicted.category !== 'Uncategorized' ? predicted.category : null;
        }

        const resolvedCategory = await this.resolveMonoTransactionCategory(
          finalCategory,
          finalSubCategory || finalAiCategory,
        );
        if (resolvedCategory) {
          finalCategory = resolvedCategory.category;
          finalCategoryId = resolvedCategory.categoryId;
          finalSubCategory = resolvedCategory.subCategory;
          finalSubCategoryId = resolvedCategory.subCategoryId;
        }

        return this.transactionRepository.create({
          monoTransactionId,
          monoAccount: { id: account.id } as any,
          narration: tx.narration || '',
          amount: tx.amount,
          type: tx.type,
          category: finalCategory,
          subCategory: finalSubCategory,
          categoryId: finalCategoryId,
          subCategoryId: finalSubCategoryId,
          aiCategory: finalAiCategory,
          categorySource: finalCategorySource,
          isCategorised: !!finalCategory || !!finalSubCategory,
          currency: tx.currency || 'NGN',
          balance: this.toNullableMinorCurrencyUnit(tx.balance),
          date: new Date(tx.date),
          metadata: tx.enrichment || tx.metadata || null,
        });
      }),
    );
    await this.transactionRepository
      .createQueryBuilder()
      .insert()
      .into(MonoTransaction)
      .values(entities)
      .orUpdate(
        [
          'narration',
          'amount',
          'type',
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
        const monoAccountFkColumnName = await this.getMonoAccountFkColumnName();
        const query = this.transactionRepository
          .createQueryBuilder('tx')
          .where(`tx.${this.quoteIdentifier(monoAccountFkColumnName)} = :monoAccountId`, {
            monoAccountId: acc.id,
          });

        if (start && end) {
          query.andWhere('tx.date BETWEEN :startDate AND :endDate', {
            startDate: this.parseDateParam(start),
            endDate: this.parseDateParam(end),
          });
        } else if (start) {
          query.andWhere('tx.date >= :startDate', {
            startDate: this.parseDateParam(start),
          });
        } else if (end) {
          query.andWhere('tx.date <= :endDate', {
            endDate: this.parseDateParam(end),
          });
        }

        const transactions = await query.orderBy('tx.date', 'DESC').getMany();

        const financeIdByExternalId = await this.getFinanceIdMap(transactions);

        return {
          bankName: acc.institutionName,
          monoAccountId: acc.monoAccountId,
          accountNumber: acc.accountNumber,
          currency: acc.currency || 'NGN',
          syncedRange: {
            earliest: acc.earliestSyncedAt,
            latest: acc.lastSyncedAt,
          },
          total: transactions.length,
          data: transactions.map((transaction) => ({
            ...transaction,
            amount: this.toMajorCurrencyUnit(transaction.amount),
            balance:
              transaction.balance === null || transaction.balance === undefined
                ? null
                : this.toMajorCurrencyUnit(transaction.balance),
            currency: transaction.currency || acc.currency || 'NGN',
            financeTransactionId:
              financeIdByExternalId.get(
                `mono_${transaction.monoTransactionId}`,
              ) || null,
          })),
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
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos', day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${value('day')}-${value('month')}-${value('year')}`;
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

  async updateTransactionCategory(
    userId: string,
    transactionId: string,
    dto: UpdateTransactionCategoryDto,
  ) {
    const transaction = await this.resolveMonoTransactionForUpdate(
      userId,
      transactionId,
    );

    if (!transaction) {
      const financeTransaction = await this.financeTransactionRepository.findOne(
        {
          where: { id: transactionId },
        },
      );

      if (financeTransaction) {
        return this.updateFinanceOnlyTransactionCategory(
          userId,
          financeTransaction,
          dto,
        );
      }

      throw new NotFoundException('Transaction not found');
    }

    let categoryId = dto.categoryId;
    const subCategoryId = dto.subCategoryId;
    let category: string | null = null;
    let subCategory: string | null = null;

    if (categoryId) {
      const cat = await this.categoryRepo.findOneBy({ id: categoryId });
      if (!cat) {
        throw new BadRequestException('Invalid categoryId');
      }
      category = cat.type;
    }

    if (subCategoryId) {
      const sub = await this.subCategoryRepo.findOne({
        where: { id: subCategoryId },
        relations: ['category'],
      });
      if (!sub) {
        throw new BadRequestException('Invalid subCategoryId');
      }
      subCategory = sub.name;
      if (!categoryId) {
        categoryId = sub.category.id;
        category = sub.category.type;
      }
    }

    if (!category && !subCategory) {
      throw new BadRequestException(
        'You must provide at least a categoryId or subCategoryId',
      );
    }

    transaction.manualCategory = category;
    transaction.manualSubCategory = subCategory;
    transaction.category = category;
    transaction.categoryId = categoryId || null;
    transaction.subCategory = subCategory;
    transaction.subCategoryId = subCategoryId || null;
    transaction.isCategorised = true;
    transaction.categorySource = CategorySource.MANUAL;

    await this.transactionRepository.save(transaction);
    await this.syncFinanceTransactionCategory(transaction);

    if (transaction.monoAccount?.user?.id && category) {
      this.aiCategorizationService
        .learnFeedback(
          transaction.narration,
          category,
          transaction.monoAccount.user.id,
        )
        .catch((err) =>
          this.logger.error(`Failed to learn feedback: ${err.message}`),
        );
    }

    return {
      id: transaction.id,
      financeTransactionId: await this.findFinanceTransactionId(transaction),
      category: transaction.category,
      categoryId: transaction.categoryId,
      subCategory: transaction.subCategory,
      subCategoryId: transaction.subCategoryId,
      categorySource: transaction.categorySource,
    };
  }

  async resetTransactionCategory(userId: string, transactionId: string) {
    const transaction = await this.resolveMonoTransactionForUpdate(
      userId,
      transactionId,
    );

    if (!transaction) {
      const financeTransaction = await this.financeTransactionRepository.findOne(
        {
          where: { id: transactionId },
        },
      );

      if (financeTransaction) {
        return this.resetFinanceOnlyTransactionCategory(
          userId,
          financeTransaction,
        );
      }

      throw new NotFoundException('Transaction not found');
    }

    transaction.manualCategory = null;
    transaction.manualSubCategory = null;
    transaction.category = null;
    transaction.isCategorised = false;
    transaction.categorySource = CategorySource.MONO; // Reset to default
    transaction.categoryId = null;
    transaction.subCategory = null;
    transaction.subCategoryId = null;
    await this.transactionRepository.save(transaction);
    await this.syncFinanceTransactionCategory(transaction);

    return {
      id: transaction.id,
      financeTransactionId: await this.findFinanceTransactionId(transaction),
      category: transaction.category,
      subCategory: transaction.subCategory,
      categorySource: transaction.categorySource,
    };
  }

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

  async recordSyncWebhook(payload: { event: string; data: any }, rawBody?: Buffer) {
    if (!['mono.accounts.jobs.update', 'mono.events.account_updated', 'mono.accounts.account_updated'].includes(payload.event)) return;
    const accountId = typeof payload.data?.account === 'string'
      ? payload.data.account : payload.data?.account?._id || payload.data?.account?.id;
    if (typeof accountId !== 'string') return;
    const entry = {
      receivedAt: new Date().toISOString(),
      event: payload.event,
      body: rawBody ? rawBody.toString('utf8') : JSON.stringify(payload),
    };
    // Append atomically so concurrent job/account deliveries cannot overwrite each other.
    await this.monoAccountRepository.query(`
      UPDATE mono_accounts SET "syncWebhooks" = (
        SELECT COALESCE(jsonb_agg(value ORDER BY ordinal), '[]'::jsonb)
        FROM (
          SELECT value, ordinal
          FROM jsonb_array_elements(COALESCE("syncWebhooks", '[]'::jsonb) || $1::jsonb)
            WITH ORDINALITY AS entries(value, ordinal)
          ORDER BY ordinal DESC LIMIT 20
        ) recent
      ) WHERE "monoAccountId" = $2
    `, [JSON.stringify([entry]), accountId]);
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
      case 'mono.accounts.account_updated':
        this.logger.log(
          `Account updated — data status: ${data?.meta?.data_status}`,
        );
        await this.handleAccountUpdated(data).catch((e) =>
          this.logger.error(e),
        );
        break;

      case 'mono.accounts.jobs.update':
        if (
          data?.name === 'jobs.accounts.sync_statement' &&
          typeof data?.account === 'string' && typeof data?.id === 'string' &&
          ['processing', 'finished', 'failed'].includes(String(data?.status).toLowerCase())
        ) {
          // A delayed webhook for an older job must not replace the latest job.
          await this.monoAccountRepository.update(
            { monoAccountId: data.account, syncJobId: data.id },
            { syncJobStatus: String(data.status).toLowerCase(), syncJobCheckedAt: new Date() },
          );
        }
        // Fetch the completed job's data without starting another bank refresh.
        // Let failures propagate so Mono can retry delivery.
        if (
          data?.name === 'jobs.accounts.sync_statement' &&
          String(data?.status).toLowerCase() === 'finished' &&
          typeof data?.account === 'string'
        ) {
          const account = await this.monoAccountRepository.findOne({
            where: { monoAccountId: data.account },
          });
          if (account) {
            await this.syncTransactionsForAccount(
              account, undefined, false, false, false, false,
            );
            await this.transactionSyncService.syncAccountTransactions(data.account);
          }
        }
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

        // Auto-link to the user's business if it exists
        if (userId) {
          try {
            const businessId =
              await this.businessService.getBusinessIdForUser(userId);
            account.businessId = businessId;
            this.logger.log(
              `Auto-linked account ${monoAccountId} to business ${businessId}`,
            );
          } catch (e) {
            this.logger.warn(
              `Could not auto-link business for user ${userId}: ${e.message}`,
            );
          }
        }

        await this.monoAccountRepository.save(account);
        this.logger.log(`Saved new MonoAccount: ${monoAccountId}`);
      } else {
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

  private hasTransactionData(meta: any): boolean {
    const status = String(meta?.data_status || '').toUpperCase();
    return (
      status === 'AVAILABLE' ||
      (status === 'PARTIAL' &&
        Array.isArray(meta?.retrieved_data) &&
        meta.retrieved_data.includes('transactions'))
    );
  }

  private async handleAccountUpdated(data: any) {
    const monoAccountId = data?.account?._id || data?.id;
    if (!monoAccountId) return;

    try {
      const existing = await this.monoAccountRepository.findOne({
        where: { monoAccountId },
        relations: ['user'],
      });

      const updateData: any = {
        dataStatus: data?.meta?.data_status,
        name: data?.account?.name,
        accountNumber: data?.account?.accountNumber,
        currency: data?.account?.currency || 'NGN',
        balance: data?.account?.balance,
        type: data?.account?.type,
        bvn: data?.account?.bvn,
        institutionName: data?.account?.institution?.name,
        institutionBankCode: data?.account?.institution?.bankCode,
      };

      // Check if we can auto-link business if it's missing
      if (existing && !existing.businessId && existing.user) {
        try {
          const businessId = await this.businessService.getBusinessIdForUser(
            existing.user.id,
          );
          updateData.businessId = businessId;
          this.logger.log(
            `Auto-linked existing account ${monoAccountId} to business ${businessId}`,
          );
        } catch (e) {
          this.logger.warn(
            `Auto-link attempt failed for ${monoAccountId}: ${e.message}`,
          );
        }
      }

      await this.monoAccountRepository.update({ monoAccountId }, updateData);
      this.logger.log(`Updated MonoAccount: ${monoAccountId}`);

      const account = await this.monoAccountRepository.findOne({
        where: { monoAccountId },
        relations: ['user'],
      });
      const syncStatus = String(data?.meta?.sync_status || '').toUpperCase();
      if (
        account && this.hasTransactionData(data?.meta) &&
        (!syncStatus || syncStatus === 'SUCCESSFUL')
      ) {
        this.logger.log(
          `Importing available transactions for ${monoAccountId}`,
        );

        // Import refreshed history even when an earlier request already advanced
        // the local cursor. Never start another realtime job from its webhook.
        await this.syncTransactionsForAccount(account, undefined, true, false, false, false)
          .then(async () => {
            this.logger.log(
              `Transaction import complete for ${monoAccountId}`,
            );

            // Sync to finance module
            await this.transactionSyncService.syncAccountTransactions(
              monoAccountId,
            );

            // Refresh webhooks must not repeat the initial enrichment jobs.
            if (account.lastSyncedAt) return;

            const canAutoCategorize = account.user
              ? await this.subscriptionService.userHasCapability(
                  account.user.id,
                  'automatic_categorization',
                )
              : false;
            const enrichmentTasks = [
              this.enrichTransactionMetadata(monoAccountId),
            ];
            if (canAutoCategorize) {
              enrichmentTasks.push(this.categoriseTransactions(monoAccountId));
            }
            await Promise.allSettled(enrichmentTasks);
            if (canAutoCategorize) {
              await this.monoAccountRepository.update(
                { id: account.id },
                { lastCategorisedAt: new Date() },
              );
            }
            this.logger.log(`Enrichment triggered for ${monoAccountId}`);
          })
          .catch((e) =>
            this.logger.error(
              `Transaction sync/enrichment failed for ${monoAccountId}: ${e.message}`,
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

    if (data?.status === 'failed' || data?.message) {
      this.logger.warn(
        `Categorisation failed or incomplete for account: ${monoAccountId}. Message: ${data?.message}. Scheduling retry.`,
      );
      this.retryMonoAction(`categorise_${monoAccountId}`, () =>
        this.categoriseTransactions(monoAccountId),
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

    await this.syncTransactionsForAccount(account, undefined, true, false, false, false);
    await this.transactionSyncService.syncAccountTransactions(monoAccountId);

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
  async handleTransactionMetadata(data: any) {
    const monoAccountId = data?.account || data?.id;
    if (!monoAccountId) {
      this.logger.warn(
        'Transaction metadata webhook received without account ID',
      );
      return;
    }

    if (data?.status === 'failed' || data?.message) {
      this.logger.warn(
        `Metadata enrichment failed or incomplete for account: ${monoAccountId}. Message: ${data?.message}. Scheduling retry.`,
      );
      this.retryMonoAction(`enrich_metadata_${monoAccountId}`, () =>
        this.enrichTransactionMetadata(monoAccountId),
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

    await this.syncTransactionsForAccount(account, undefined, true, false, false, false);
    await this.transactionSyncService.syncAccountTransactions(monoAccountId);

    this.logger.log(`Transaction metadata updated for ${monoAccountId}`);
  }

  async linkAccountToBusiness(
    userId: string,
    monoAccountId: string,
    businessId: string,
  ) {
    const account = await this.monoAccountRepository.findOne({
      where: { monoAccountId, user: { id: userId } },
    });

    if (!account) {
      throw new NotFoundException('Mono account not found');
    }

    account.businessId = businessId;
    const saved = await this.monoAccountRepository.save(account);

    // Trigger immediate sync to Finance module so the account appears in the dashboard
    void this.transactionSyncService
      .syncAccountTransactions(monoAccountId)
      .catch((e) =>
        this.logger.error(
          `Failed to sync account ${monoAccountId} after linking business: ${e.message}`,
        ),
      );

    return this.toMonoAccountResponse(saved);
  }

  private toMonoAccountResponse(account: MonoAccount) {
    return {
      ...account,
      currency: account.currency || 'NGN',
      balance:
        account.balance === null || account.balance === undefined
          ? account.balance
          : this.toMajorCurrencyUnit(account.balance),
    };
  }

  private toMajorCurrencyUnit(amount: number | string): number {
    return Number(amount) / 100;
  }

  private toNullableMinorCurrencyUnit(amount: unknown): number | null {
    if (amount === null || amount === undefined || amount === '') {
      return null;
    }

    const numericAmount = Number(amount);
    return Number.isFinite(numericAmount) ? numericAmount : null;
  }

  private async findFinanceTransactionId(
    transaction: MonoTransaction,
  ): Promise<string | null> {
    const financeTransaction = await this.financeTransactionRepository.findOne({
      where: {
        externalId: `mono_${transaction.monoTransactionId}`,
      },
      select: ['id'],
    });

    return financeTransaction?.id || null;
  }

  private async resolveMonoTransactionForUpdate(
    userId: string,
    transactionId: string,
  ): Promise<MonoTransaction | null> {
    const directMonoTransaction = await this.findMonoTransactionWithUser(
      transactionId,
    );

    if (directMonoTransaction) {
      this.assertMonoTransactionOwner(directMonoTransaction, userId);
      return directMonoTransaction;
    }

    const financeTransaction = await this.financeTransactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!financeTransaction) {
      return null;
    }

    if (financeTransaction.userId !== userId) {
      throw new UnauthorizedException(
        'You can only modify your own transactions',
      );
    }

    if (!financeTransaction.externalId?.startsWith('mono_')) {
      return null;
    }

    const monoTransactionId = financeTransaction.externalId.slice(5);
    const mirroredMonoTransaction = await this.transactionRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.monoAccount', 'monoAccount')
      .leftJoinAndSelect('monoAccount.user', 'user')
      .where('tx.monoTransactionId = :monoTransactionId', {
        monoTransactionId,
      })
      .getOne();

    if (!mirroredMonoTransaction) {
      return null;
    }

    this.assertMonoTransactionOwner(mirroredMonoTransaction, userId);
    return mirroredMonoTransaction;
  }

  private findMonoTransactionWithUser(
    transactionId: string,
  ): Promise<MonoTransaction | null> {
    return this.transactionRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.monoAccount', 'monoAccount')
      .leftJoinAndSelect('monoAccount.user', 'user')
      .where('tx.id = :transactionId', { transactionId })
      .getOne();
  }

  private assertMonoTransactionOwner(
    transaction: MonoTransaction,
    userId: string,
  ) {
    if (transaction.monoAccount?.user?.id !== userId) {
      throw new UnauthorizedException(
        'You can only modify your own transactions',
      );
    }
  }

  private async updateFinanceOnlyTransactionCategory(
    userId: string,
    financeTransaction: FinanceTransaction,
    dto: UpdateTransactionCategoryDto,
  ) {
    if (financeTransaction.userId !== userId) {
      throw new UnauthorizedException(
        'You can only modify your own transactions',
      );
    }

    let categoryId = dto.categoryId;
    const subCategoryId = dto.subCategoryId;
    let category: string | null = null;
    let subCategory: string | null = null;

    if (categoryId) {
      const cat = await this.categoryRepo.findOneBy({ id: categoryId });
      if (!cat) {
        throw new BadRequestException('Invalid categoryId');
      }
      category = cat.type;
    }

    if (subCategoryId) {
      const sub = await this.subCategoryRepo.findOne({
        where: { id: subCategoryId },
        relations: ['category'],
      });
      if (!sub) {
        throw new BadRequestException('Invalid subCategoryId');
      }
      subCategory = sub.name;
      if (!categoryId) {
        categoryId = sub.category.id;
        category = sub.category.type;
      }
    }

    if (!category && !subCategory) {
      throw new BadRequestException(
        'You must provide at least a categoryId or subCategoryId',
      );
    }

    financeTransaction.manualCategory = category as any;
    financeTransaction.manualSubCategory = subCategory as any;
    financeTransaction.category = category as any;
    financeTransaction.categoryId = (categoryId || null) as any;
    financeTransaction.subCategory = subCategory as any;
    financeTransaction.subCategoryId = (subCategoryId || null) as any;
    financeTransaction.isCategorised = true;
    financeTransaction.categorySource = CategorySource.MANUAL;

    await this.financeTransactionRepository.save(financeTransaction);

    return {
      id: financeTransaction.id,
      financeTransactionId: financeTransaction.id,
      category: financeTransaction.category,
      categoryId: financeTransaction.categoryId,
      subCategory: financeTransaction.subCategory,
      subCategoryId: financeTransaction.subCategoryId,
      categorySource: financeTransaction.categorySource,
    };
  }

  private async resetFinanceOnlyTransactionCategory(
    userId: string,
    financeTransaction: FinanceTransaction,
  ) {
    if (financeTransaction.userId !== userId) {
      throw new UnauthorizedException(
        'You can only modify your own transactions',
      );
    }

    financeTransaction.manualCategory = null as any;
    financeTransaction.manualSubCategory = null as any;
    financeTransaction.category = null as any;
    financeTransaction.categoryId = null as any;
    financeTransaction.subCategory = null as any;
    financeTransaction.subCategoryId = null as any;
    financeTransaction.isCategorised = false;
    financeTransaction.categorySource = CategorySource.MONO;

    await this.financeTransactionRepository.save(financeTransaction);

    return {
      id: financeTransaction.id,
      financeTransactionId: financeTransaction.id,
      category: financeTransaction.category,
      subCategory: financeTransaction.subCategory,
      categorySource: financeTransaction.categorySource,
    };
  }

  private async syncFinanceTransactionCategory(
    transaction: MonoTransaction,
  ): Promise<void> {
    const financeTransaction = await this.financeTransactionRepository.findOne({
      where: {
        externalId: `mono_${transaction.monoTransactionId}`,
      },
    });

    if (!financeTransaction) {
      return;
    }

    financeTransaction.category = (transaction.category || null) as any;
    financeTransaction.categoryId = (transaction.categoryId || null) as any;
    financeTransaction.subCategory = (transaction.subCategory || null) as any;
    financeTransaction.subCategoryId = (transaction.subCategoryId ||
      null) as any;
    financeTransaction.manualCategory = (transaction.manualCategory ||
      null) as any;
    financeTransaction.manualSubCategory = (transaction.manualSubCategory ||
      null) as any;
    financeTransaction.isCategorised = transaction.isCategorised;
    financeTransaction.categorySource = transaction.categorySource;

    await this.financeTransactionRepository.save(financeTransaction);
  }

  private async resolveMonoTransactionCategory(
    category: string | null,
    subCategory: string | null,
  ): Promise<{
    category: string | null;
    categoryId: string | null;
    subCategory: string | null;
    subCategoryId: string | null;
  } | null> {
    const subCategoryCandidates = [subCategory, category].filter(
      (value): value is string => !!value && value.trim().length > 0,
    );

    for (const candidate of subCategoryCandidates) {
      const matchedSubCategory = await this.subCategoryRepo.findOne({
        where: { name: candidate },
        relations: ['category'],
      });

      if (matchedSubCategory?.category) {
        return {
          category: matchedSubCategory.category.type,
          categoryId: matchedSubCategory.category.id,
          subCategory: matchedSubCategory.name,
          subCategoryId: matchedSubCategory.id,
        };
      }
    }

    if (!category) {
      return null;
    }

    const matchedCategory = await this.categoryRepo.findOne({
      where: [{ name: category }, { type: category as any }],
    });
    if (!matchedCategory) {
      return null;
    }

    return {
      category: matchedCategory.type,
      categoryId: matchedCategory.id,
      subCategory: subCategory || null,
      subCategoryId: null,
    };
  }

  private async getFinanceIdMap(transactions: MonoTransaction[]) {
    const externalIds = transactions.map((transaction) => {
      return `mono_${transaction.monoTransactionId}`;
    });

    if (externalIds.length === 0) {
      return new Map<string, string>();
    }

    const financeTransactions = await this.financeTransactionRepository.find({
      where: { externalId: In(externalIds) },
      select: ['id', 'externalId'],
    });

    return new Map(
      financeTransactions.map((transaction) => [
        transaction.externalId,
        transaction.id,
      ]),
    );
  }

  private async getMonoAccountFkColumnName(): Promise<string> {
    if (this.monoAccountFkColumnName) {
      return this.monoAccountFkColumnName;
    }

    const columns = await this.transactionRepository.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'mono_transactions'
          AND table_schema = current_schema()
      `,
    );

    const candidates = [
      'monoAccountId',
      'monoaccountid',
      'mono_account_id',
    ];

    const matched =
      candidates.find((candidate) =>
        columns.some((column: { column_name: string }) => column.column_name === candidate),
      ) ||
      columns.find((column: { column_name: string }) =>
        /mono.*account.*id/i.test(column.column_name),
      )?.column_name;

    if (!matched) {
      throw new Error(
        'Could not resolve mono_transactions account foreign key column',
      );
    }

    this.monoAccountFkColumnName = matched;
    return matched;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
