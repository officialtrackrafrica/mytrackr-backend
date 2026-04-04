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

  async syncAccountTransactions(monoAccountId: string): Promise<{
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

    let businessId = monoAccount.businessId || null;
    const userId = monoAccount.user ? monoAccount.user.id : null;

    // If the MonoAccount doesn't have an explicit businessId, resolve it
    // from the user's business profile so transactions are tagged correctly
    // for P&L and analytics reports.
    if (!businessId && userId) {
      try {
        businessId = await this.businessService.getBusinessIdForUser(userId);
        this.logger.log(
          `Auto-resolved businessId=${businessId} from user ${userId} for MonoAccount ${monoAccountId}`,
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
    );
  }

  private async syncWithBankAccount(
    monoAccountUuid: string,
    bankAccountId: string,
    businessId: string | null,
    userId: string | null,
  ): Promise<{ synced: number; skipped: string | null }> {
    const monoTransactions = await this.monoTransactionRepository.find({
      where: { monoAccount: { id: monoAccountUuid } },
      order: { date: 'ASC' },
    });

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
    }));

    const synced = await this.categorizationService.ingestTransactions(
      businessId,
      userId,
      rawDtos,
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
}
