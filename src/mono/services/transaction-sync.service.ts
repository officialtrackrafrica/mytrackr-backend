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

    const businessId = monoAccount.businessId || null;
    const userId = monoAccount.user ? monoAccount.user.id : null;

    const bankAccount = await this.bankAccountRepository.findOne({
      where: {
        accountNumber: monoAccount.accountNumber,
        businessId: businessId || IsNull(),
        userId: userId || IsNull(),
      },
    });

    if (!bankAccount) {
      this.logger.warn(
        `No linked BankAccount for MonoAccount ${monoAccountId}. ` +
          `Creating one automatically.`,
      );

      const newBankAccount = this.bankAccountRepository.create({
        providerAccountId: monoAccount.monoAccountId,
        accountNumber: monoAccount.accountNumber || '',
        bankName: monoAccount.institutionName || 'Unknown',
        currentBalance: Number(monoAccount.balance) / 100,
        businessId: businessId || undefined,
        userId: userId || undefined,
      });
      await this.bankAccountRepository.save(newBankAccount);

      return this.syncWithBankAccount(
        monoAccount.id,
        newBankAccount.id,
        newBankAccount.businessId,
        newBankAccount.userId,
      );
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
