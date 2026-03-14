import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    const businessIdString = monoAccount.user ? monoAccount.user.id : '';

    const bankAccount = await this.bankAccountRepository.findOne({
      where: {
        accountNumber: monoAccount.accountNumber,
        businessId: businessIdString,
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
        businessId: businessIdString,
      });
      await this.bankAccountRepository.save(newBankAccount);

      return this.syncWithBankAccount(
        monoAccountId,
        newBankAccount.id,
        newBankAccount.businessId,
      );
    }

    return this.syncWithBankAccount(
      monoAccountId,
      bankAccount.id,
      bankAccount.businessId,
    );
  }

  private async syncWithBankAccount(
    monoAccountId: string,
    bankAccountId: string,
    businessId: string,
  ): Promise<{ synced: number; skipped: string | null }> {
    const monoTransactions = await this.monoTransactionRepository.find({
      where: { monoAccount: { monoAccountId } },
      order: { date: 'ASC' },
    });

    if (monoTransactions.length === 0) {
      return { synced: 0, skipped: 'No Mono transactions to sync' };
    }

    const rawDtos: RawTransactionDto[] = monoTransactions.map((mt) => ({
      bankAccountId,
      businessId,
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
      rawDtos,
    );

    this.logger.log(
      `Synced ${synced}/${monoTransactions.length} Mono transactions for account ${monoAccountId}`,
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
