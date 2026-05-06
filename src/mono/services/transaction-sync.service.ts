import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Transaction as MonoTransaction } from '../entities/transaction.entity';
import { MonoAccount } from '../entities/mono-account.entity';
import {
  CategorizationService,
  RawTransactionDto,
} from '../../finance/services/categorization.service';
import { TransactionDirection } from '../../finance/entities/transaction.entity';
import { BankAccount } from '../../finance/entities/bank-account.entity';
import { BusinessService } from '../../business/services/business.service';

@Injectable()
export class TransactionSyncService {
  private readonly logger = new Logger(TransactionSyncService.name);
  private monoAccountFkColumnName: string | null = null;

  constructor(
    @InjectRepository(MonoTransaction)
    private readonly monoTransactionRepository: Repository<MonoTransaction>,
    @InjectRepository(MonoAccount)
    private readonly monoAccountRepository: Repository<MonoAccount>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
    private readonly categorizationService: CategorizationService,
    private readonly businessService: BusinessService,
  ) {}

  async syncAccountTransactions(
    monoAccountId: string,
    options?: { autoCategorize?: boolean },
  ): Promise<{
    synced: number;
    skipped: string | null;
  }> {
    const monoAccount = await this.monoAccountRepository.findOne({
      where: { monoAccountId },
      relations: ['user'],
    });

    if (!monoAccount) {
      this.logger.warn(
        `MonoAccount not found for monoAccountId=${monoAccountId}`,
      );
      return { synced: 0, skipped: 'MonoAccount not found' };
    }

    const userId = monoAccount.user ? monoAccount.user.id : null;

    // Always resolve businessId from the user's business profile.
    // Mono does NOT provide a businessId — the user's profile is the
    // single source of truth for associating transactions with a business.
    let businessId: string | null = null;
    if (userId) {
      try {
        businessId = await this.businessService.getBusinessIdForUser(userId);
        this.logger.log(
          `Resolved businessId=${businessId} from user ${userId} for MonoAccount ${monoAccountId}`,
        );
      } catch {
        this.logger.warn(
          `User ${userId} has no business profile — transactions will have null businessId`,
        );
      }
    }

    // Use providerAccountId as a unique identifier for the lookup
    let bankAccount = await this.bankAccountRepository.findOne({
      where: {
        providerAccountId: monoAccountId,
      },
    });

    if (!bankAccount) {
      this.logger.warn(
        `No linked BankAccount for MonoAccount ${monoAccountId}. ` +
          `Creating one automatically.`,
      );

      const existingCount = await this.bankAccountRepository.count({
        where: {
          businessId: businessId || IsNull(),
          userId: userId || IsNull(),
        },
      });

      bankAccount = this.bankAccountRepository.create({
        providerAccountId: monoAccount.monoAccountId,
        accountNumber: monoAccount.accountNumber || '',
        bankName: monoAccount.institutionName || 'Unknown',
        currentBalance: Number(monoAccount.balance) / 100,
        businessId: businessId || undefined,
        userId: userId || undefined,
        isPrimary: existingCount === 0,
      });
      await this.bankAccountRepository.save(bankAccount);
    } else {
      // Update businessId/userId if they've changed (e.g. account just linked to business)
      if (
        bankAccount.businessId !== businessId ||
        bankAccount.userId !== userId
      ) {
        this.logger.log(
          `Updating existing BankAccount record for ${monoAccountId} with new business/user context`,
        );
        bankAccount.businessId = businessId;
        bankAccount.userId = userId;
        await this.bankAccountRepository.save(bankAccount);
      }

      // Always update balance if available from last sync
      if (monoAccount.balance !== undefined) {
        bankAccount.currentBalance = Number(monoAccount.balance) / 100;
        await this.bankAccountRepository.save(bankAccount);
      }
    }

    return this.syncWithBankAccount(
      monoAccount.id,
      bankAccount.id,
      bankAccount.businessId,
      bankAccount.userId,
      options,
    );
  }

  private async syncWithBankAccount(
    monoAccountUuid: string,
    bankAccountId: string,
    businessId: string | null,
    userId: string | null,
    options?: { autoCategorize?: boolean },
  ): Promise<{ synced: number; skipped: string | null }> {
    const monoAccountFkColumnName = await this.getMonoAccountFkColumnName();
    const monoTransactions = await this.monoTransactionRepository
      .createQueryBuilder('tx')
      .where(`tx.${this.quoteIdentifier(monoAccountFkColumnName)} = :monoAccountUuid`, {
        monoAccountUuid,
      })
      .orderBy('tx.date', 'ASC')
      .getMany();

    this.logger.log(
      `Found ${monoTransactions.length} Mono transactions for account ${monoAccountUuid}`,
    );

    if (monoTransactions.length === 0) {
      return { synced: 0, skipped: 'No Mono transactions to sync' };
    }

    const rawDtos: RawTransactionDto[] = monoTransactions.map((mt) => ({
      bankAccountId,
      businessId: businessId || undefined,
      userId: userId || undefined,
      externalId: `mono_${mt.monoTransactionId}`,
      date: mt.date,
      amount: Number(mt.amount) / 100,
      direction:
        mt.type === 'credit'
          ? TransactionDirection.CREDIT
          : TransactionDirection.DEBIT,
      description: mt.narration,
      monoCategory: mt.category || undefined,
    }));

    const synced = await this.categorizationService.ingestTransactions(
      businessId,
      userId,
      rawDtos,
      { autoCategorize: options?.autoCategorize ?? false },
    );

    this.logger.log(
      `Synced ${synced} new transactions to Finance module for business ${businessId} / user ${userId}`,
    );

    return { synced, skipped: null };
  }

  async syncAllUserTransactions(
    userId: string,
  ): Promise<{ total: number; results: any[] }> {
    const accounts = await this.monoAccountRepository.find({
      where: { user: { id: userId } },
    });

    const results: any[] = [];
    let total = 0;

    for (const account of accounts) {
      const result = await this.syncAccountTransactions(account.monoAccountId);
      total += result.synced;
      results.push({
        monoAccountId: account.monoAccountId,
        synced: result.synced,
        skipped: result.skipped,
      });
    }

    return { total, results };
  }

  private async getMonoAccountFkColumnName(): Promise<string> {
    if (this.monoAccountFkColumnName) {
      return this.monoAccountFkColumnName;
    }

    const columns = await this.monoTransactionRepository.query(
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
