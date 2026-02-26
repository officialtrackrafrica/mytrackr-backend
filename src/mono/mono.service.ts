import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiateAccountDto,
  ReauthAccountDto,
} from './dto/initiate-account.dto';
import { CreditworthinessDto } from './dto/creditworthiness.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonoAccount } from './entities/mono-account.entity';
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
            acc.accountId,
            months,
            realtime,
          );
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            accountNumber: acc.accountNumber,
            data: statement,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
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
    paginate?: boolean,
    realtime?: boolean,
    start?: string,
    end?: string,
  ) {
    const userAccounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });

    if (!userAccounts.length) {
      return { message: 'No linked accounts found for this user', data: [] };
    }

    const transactionsData = await Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const txs = await this.getTransactions(
            acc.accountId,
            paginate,
            realtime,
            start,
            end,
          );
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            accountNumber: acc.accountNumber,
            data: txs,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            accountNumber: acc.accountNumber,
            error: error.message,
          };
        }
      }),
    );

    return {
      totalAccounts: userAccounts.length,
      transactions: transactionsData,
    };
  }

  async getTransactions(
    accountId: string,
    paginate?: boolean,
    realtime?: boolean,
    start?: string,
    end?: string,
  ) {
    const params = new URLSearchParams();
    if (paginate === false) params.append('paginate', 'false');
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    const queryString = params.toString();
    const url = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;

    const headers = realtime ? { 'x-real-time': 'true' } : undefined;
    return this.monoGet(url, headers);
  }

  async categoriseAllUserTransactions(userId: string) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.categoriseTransactions(acc.accountId);
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
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

  async getAllUserCredits(userId: string) {
    const userAccounts = await this.getUserLinkedAccounts(userId);
    if (!userAccounts.length)
      return { message: 'No linked accounts found', data: [] };

    return Promise.all(
      userAccounts.map(async (acc) => {
        try {
          const res = await this.getCredits(acc.accountId);
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
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
          const res = await this.getDebits(acc.accountId);
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
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
          const res = await this.getIncome(acc.accountId);
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
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
          const res = await this.getCreditworthiness(acc.accountId, dto);
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
            data: res,
          };
        } catch (error) {
          return {
            bankName: acc.institutionName,
            accountId: acc.accountId,
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
          `Account connected — account id: ${data?.id}, customer: ${data?.customer}`,
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
    const accountId = data?.id;

    if (!accountId) return;

    try {
      let account = await this.monoAccountRepository.findOne({
        where: { accountId },
        relations: ['user'],
      });

      if (!account) {
        account = this.monoAccountRepository.create({
          accountId,
          user: userId ? ({ id: userId } as any) : null,
          dataStatus: 'CONNECTED',
        });
        await this.monoAccountRepository.save(account);
        this.logger.log(`Saved new MonoAccount: ${accountId}`);
      } else {
        // Prevent stealing link if already linked to another user
        if (account.user && account.user.id !== userId) {
          this.logger.warn(
            `Security Warning: User ${userId} attempted to link an account already linked to ${account.user.id}`,
          );
          // We optionally could unlink it from the old user, or throw an error to the dashboard (if we had websockets),
          // but for security we simply reject the stealing attempt silently at the webhook level.
          return;
        }

        this.logger.log(
          `Account ${accountId} already linked. Updating user reference.`,
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
    const accountId = data?.account?._id || data?.id;
    if (!accountId) return;

    try {
      await this.monoAccountRepository.update(
        { accountId },
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
      this.logger.log(`Updated MonoAccount: ${accountId}`);
    } catch (error) {
      this.logger.error(`Error updating account data: ${error.message}`);
    }
  }
}
